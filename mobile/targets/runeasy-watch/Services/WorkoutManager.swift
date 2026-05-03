import Foundation
import HealthKit
import CoreLocation
import Combine

// Orquestra HKWorkoutSession + HKLiveWorkoutBuilder + CLLocationManager + HKWorkoutRouteBuilder.
// Expõe @Published metrics para a View binda direto.
// Substitui o tick() mock da Phase 2.
@MainActor
final class WorkoutManager: NSObject, ObservableObject {

    // MARK: - Published (consumidos pela View)

    @Published var metrics = RunMetrics()
    @Published var sessionState: HKWorkoutSessionState = .notStarted
    @Published var hasPermission: Bool = false
    @Published var permissionError: String?
    @Published var isRunning: Bool = false

    // MARK: - HealthKit / GPS

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var routeBuilder: HKWorkoutRouteBuilder?
    private let locationManager = CLLocationManager()

    // MARK: - State acumulado

    private(set) var startDate: Date?
    private(set) var routePoints: [RoutePoint] = []
    private(set) var heartRateSamples: [Int] = []
    private var workoutId: String?

    // Tipos lidos/escritos
    private var typesToShare: Set<HKSampleType> {
        [HKQuantityType.workoutType(), HKSeriesType.workoutRoute()]
    }
    private var typesToRead: Set<HKObjectType> {
        [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKObjectType.activitySummaryType(),
            HKSeriesType.workoutRoute()
        ]
    }

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.activityType = .fitness
        locationManager.allowsBackgroundLocationUpdates = true
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            permissionError = "HealthKit indisponível neste dispositivo."
            return
        }
        do {
            try await healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead)
            // CLLocationManager — request when in use; o sistema pede ao chamar startUpdating
            locationManager.requestWhenInUseAuthorization()
            hasPermission = true
            permissionError = nil
        } catch {
            permissionError = "Permissão HealthKit negada."
            hasPermission = false
        }
    }

    // MARK: - Lifecycle

    func startWorkout(workoutId: String?) async {
        self.workoutId = workoutId
        guard hasPermission else {
            await requestAuthorization()
            guard hasPermission else { return }
            await startWorkout(workoutId: workoutId)
            return
        }

        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor

        do {
            session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            builder = session?.associatedWorkoutBuilder()
            builder?.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
            routeBuilder = HKWorkoutRouteBuilder(healthStore: healthStore, device: nil)

            session?.delegate = self
            builder?.delegate = self

            let now = Date()
            startDate = now
            session?.startActivity(with: now)
            try await builder?.beginCollection(at: now)

            locationManager.startUpdatingLocation()
            isRunning = true
        } catch {
            permissionError = "Falha ao iniciar treino: \(error.localizedDescription)"
            isRunning = false
        }
    }

    func pause() {
        session?.pause()
    }

    func resume() {
        session?.resume()
    }

    /// Finaliza a sessão e retorna o payload pronto pra enviar ao iPhone.
    func endWorkout() async -> CompletedRun {
        let endDate = Date()
        session?.end()
        do {
            try await builder?.endCollection(at: endDate)
            _ = try await builder?.finishWorkout()
            // routeBuilder.finishRoute exige um HKWorkout — feito acima
            // Não precisamos do HKWorkoutRoute persistido localmente para o payload
        } catch {
            print("[WorkoutManager] erro ao finalizar: \(error)")
        }
        locationManager.stopUpdatingLocation()
        isRunning = false

        let avgHr = heartRateSamples.isEmpty
            ? nil
            : heartRateSamples.reduce(0, +) / heartRateSamples.count

        let payload = CompletedRun(
            workoutId: workoutId,
            totalDistanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.elapsedSeconds,
            avgPaceSecondsPerKm: metrics.avgPaceSecondsPerKm,
            avgHeartRate: avgHr,
            maxHeartRate: metrics.maxHeartRate > 0 ? metrics.maxHeartRate : nil,
            calories: metrics.calories > 0 ? metrics.calories : nil,
            routePoints: routePoints,
            startedAt: ISO8601DateFormatter().string(from: startDate ?? endDate),
            source: "apple_watch"
        )
        return payload
    }

    // MARK: - Helpers

    private func updateMetrics(from statistics: HKStatistics?) {
        guard let statistics else { return }
        switch statistics.quantityType {
        case HKQuantityType(.heartRate):
            let unit = HKUnit.count().unitDivided(by: .minute())
            if let value = statistics.mostRecentQuantity()?.doubleValue(for: unit) {
                let bpm = Int(value.rounded())
                metrics.heartRate = bpm
                if bpm > metrics.maxHeartRate { metrics.maxHeartRate = bpm }
                heartRateSamples.append(bpm)
            }
        case HKQuantityType(.activeEnergyBurned):
            if let value = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) {
                metrics.calories = Int(value.rounded())
            }
        case HKQuantityType(.distanceWalkingRunning):
            if let value = statistics.sumQuantity()?.doubleValue(for: .meter()) {
                metrics.distanceMeters = value
                if metrics.elapsedSeconds > 0 {
                    let km = value / 1000.0
                    if km > 0 {
                        metrics.avgPaceSecondsPerKm = Double(metrics.elapsedSeconds) / km
                    }
                }
            }
        default:
            break
        }
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor in
            sessionState = toState
            metrics.isPaused = (toState == .paused)
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            permissionError = "Sessão falhou: \(error.localizedDescription)"
            isRunning = false
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor in
            // Atualiza tempo decorrido (builder lida com pause automaticamente)
            metrics.elapsedSeconds = Int(workoutBuilder.elapsedTime.rounded())

            for type in collectedTypes {
                guard let quantityType = type as? HKQuantityType else { continue }
                let stats = workoutBuilder.statistics(for: quantityType)
                updateMetrics(from: stats)
            }

            // Pace atual: derivado do speed mais recente da última location (se disponível)
            if let lastSpeed = routePoints.last?.speed, lastSpeed > 0 {
                metrics.currentPaceSecondsPerKm = 1000.0 / lastSpeed
            } else {
                metrics.currentPaceSecondsPerKm = metrics.avgPaceSecondsPerKm
            }
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension WorkoutManager: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let filtered = locations.filter { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy < 50 }
        guard !filtered.isEmpty else { return }

        let points = filtered.map { RoutePoint(from: $0) }
        Task { @MainActor in
            self.routePoints.append(contentsOf: points)
        }

        // Adiciona ao routeBuilder do HealthKit (rota persistida no Health)
        Task { [routeBuilder] in
            try? await routeBuilder?.insertRouteData(filtered)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Silencioso — corrida continua mesmo sem GPS preciso
        print("[Location] erro: \(error.localizedDescription)")
    }
}

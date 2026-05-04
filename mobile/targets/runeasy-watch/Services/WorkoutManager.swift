import Foundation
import HealthKit
import CoreLocation
import Combine

// Orquestra HKWorkoutSession + HKLiveWorkoutBuilder + CLLocationManager + HKWorkoutRouteBuilder.
// Em simulator (#if targetEnvironment(simulator)), gera dados mock realistas
// para permitir validação fim-a-fim sem device físico.
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
    private var displayTask: Task<Void, Never>?
    private var simulatorTickTask: Task<Void, Never>?

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
        // Em watchOS, HKWorkoutSession ativa garante runtime estendido e captura de localização
        // sem precisar de allowsBackgroundLocationUpdates (que exigiria entitlement extra).
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            #if targetEnvironment(simulator)
            // Em alguns simuladores de Watch HealthKit não responde — concedemos mesmo assim
            hasPermission = true
            return
            #else
            permissionError = "HealthKit indisponível neste dispositivo."
            return
            #endif
        }
        do {
            try await healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead)
            locationManager.requestWhenInUseAuthorization()
            hasPermission = true
            permissionError = nil
        } catch {
            #if targetEnvironment(simulator)
            // Em simulator, não bloqueia se a permissão der erro
            hasPermission = true
            #else
            permissionError = "Permissão HealthKit negada."
            hasPermission = false
            #endif
        }
    }

    // MARK: - Lifecycle

    func startWorkout(workoutId: String?) async {
        self.workoutId = workoutId
        self.startDate = Date()

        if !hasPermission {
            await requestAuthorization()
            guard hasPermission else { return }
        }

        #if targetEnvironment(simulator)
        await startSimulatedWorkout()
        #else
        await startRealWorkout()
        #endif
    }

    private func startRealWorkout() async {
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

            let now = startDate ?? Date()
            session?.startActivity(with: now)
            try await builder?.beginCollection(at: now)

            locationManager.startUpdatingLocation()
            isRunning = true
            startDisplayTimer()
        } catch {
            permissionError = "Falha ao iniciar treino: \(error.localizedDescription)"
            isRunning = false
        }
    }

    /// Atualiza metrics.elapsedSeconds a cada 1s independente de eventos do builder,
    /// pra UI ficar fluida. builder.elapsedTime já desconta pausa automaticamente.
    private func startDisplayTimer() {
        displayTask?.cancel()
        displayTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self, let builder = self.builder else { continue }
                self.metrics.elapsedSeconds = Int(builder.elapsedTime.rounded())
            }
        }
    }

    func pause() {
        #if targetEnvironment(simulator)
        metrics.isPaused = true
        sessionState = .paused
        #else
        session?.pause()
        #endif
    }

    func resume() {
        #if targetEnvironment(simulator)
        metrics.isPaused = false
        sessionState = .running
        #else
        session?.resume()
        #endif
    }

    /// Finaliza a sessão e retorna o payload pronto pra enviar ao iPhone.
    func endWorkout() async -> CompletedRun {
        displayTask?.cancel()
        displayTask = nil
        simulatorTickTask?.cancel()
        simulatorTickTask = nil

        let endDate = Date()

        #if !targetEnvironment(simulator)
        session?.end()
        do {
            try await builder?.endCollection(at: endDate)
            _ = try await builder?.finishWorkout()
        } catch {
            print("[WorkoutManager] erro ao finalizar: \(error)")
        }
        locationManager.stopUpdatingLocation()
        #endif

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

    // MARK: - Helpers (real device)

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

    // MARK: - Simulator mock

    #if targetEnvironment(simulator)
    private func startSimulatedWorkout() async {
        isRunning = true
        sessionState = .running
        simulatorTickTask?.cancel()
        simulatorTickTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self else { return }
                guard !self.metrics.isPaused else { continue }
                self.simulateTick()
            }
        }
    }

    private func simulateTick() {
        metrics.elapsedSeconds += 1
        // ~2.78 m/s ≈ 6:00/km, com jitter pequeno pra não ficar mecânico
        let jitter = Double.random(in: 0.97...1.03)
        let stride = 2.78 * jitter
        metrics.distanceMeters += stride
        metrics.currentPaceSecondsPerKm = 360.0 / jitter
        if metrics.distanceMeters > 0 {
            let km = metrics.distanceMeters / 1000.0
            metrics.avgPaceSecondsPerKm = Double(metrics.elapsedSeconds) / km
        }
        // FC oscilando 130–160 BPM
        let phase = Double(metrics.elapsedSeconds) / 8.0
        let hr = 145 + Int((sin(phase) * 15).rounded())
        metrics.heartRate = hr
        if hr > metrics.maxHeartRate { metrics.maxHeartRate = hr }
        heartRateSamples.append(hr)
        // ~10 kcal/min
        metrics.calories = Int(Double(metrics.elapsedSeconds) * 0.167)
        // Rota fake (caminho NE em São Paulo, ~1m por segundo)
        let baseLat = -23.5505
        let baseLng = -46.6333
        let lat = baseLat + Double(metrics.elapsedSeconds) * 0.0000099
        let lng = baseLng + Double(metrics.elapsedSeconds) * 0.0000099
        let point = RoutePoint(
            latitude: lat,
            longitude: lng,
            altitude: 760.0,
            timestamp: Date().timeIntervalSince1970 * 1000.0,
            speed: stride,
            accuracy: 5.0
        )
        routePoints.append(point)
    }
    #endif
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
            metrics.elapsedSeconds = Int(workoutBuilder.elapsedTime.rounded())
            for type in collectedTypes {
                guard let quantityType = type as? HKQuantityType else { continue }
                let stats = workoutBuilder.statistics(for: quantityType)
                updateMetrics(from: stats)
            }
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
        Task { [routeBuilder] in
            try? await routeBuilder?.insertRouteData(filtered)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[Location] erro: \(error.localizedDescription)")
    }
}

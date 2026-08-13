import Foundation
import HealthKit
import CoreLocation
import Combine
import os

/// Global de arquivo, não `static` da classe: uma `static let` dentro de uma
/// classe `@MainActor` herda o isolamento e não pode ser lida dos delegates
/// `nonisolated` de HealthKit/CoreLocation.
private let workoutLog = Logger(
    subsystem: "com.oytotec.runeasy.watchkitapp",
    category: "workout"
)

// Orquestra HKWorkoutSession + HKLiveWorkoutBuilder + CLLocationManager + HKWorkoutRouteBuilder.
// Em simulator (#if targetEnvironment(simulator)), gera dados mock realistas
// para permitir validação fim-a-fim sem device físico.
//
// Fluxo de UI (ver ActiveRunView):
//   .idle → usuário vê o resumo do treino e o botão de play
//   .starting → play tocado, sessão iniciando (com watchdog de 12s)
//   .running → gravando (metrics.isPaused distingue rodando de pausado)
//   .failed → erro navegável, com "Tentar novamente" e "Voltar"
//
// A sessão NUNCA inicia sozinha. A autorização só é solicitada após o play.
@MainActor
final class WorkoutManager: NSObject, ObservableObject {

    // MARK: - Phase

    enum Phase: Equatable {
        case idle
        case authorizing
        case starting
        case running
        case failed(String)
        case finished
    }

    /// Segundos que a sessão tem para sair de `.starting`. Se estourar, o
    /// usuário recebe uma tela de erro em vez de um spinner infinito — este é
    /// o escape que faltava quando beginCollection travava (AUDITORIA §3.5).
    private static let startTimeoutSeconds: Double = 12

    // MARK: - Published (consumidos pela View)

    @Published var phase: Phase = .idle
    @Published var metrics = RunMetrics()
    @Published var sessionState: HKWorkoutSessionState = .notStarted
    @Published var hasPermission: Bool = false
    @Published var permissionError: String?

    var isRunning: Bool { phase == .running }

    // MARK: - HealthKit / GPS
    // Lazy: alguns simulators de watchOS crasham na construção eager de HKHealthStore
    // ou CLLocationManager. Inicializamos só quando precisar (= em device real).

    private lazy var healthStore: HKHealthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var routeBuilder: HKWorkoutRouteBuilder?
    private lazy var locationManager: CLLocationManager = {
        let lm = CLLocationManager()
        lm.delegate = self
        lm.desiredAccuracy = kCLLocationAccuracyBest
        lm.activityType = .fitness
        return lm
    }()

    // MARK: - State acumulado

    private(set) var startDate: Date?
    private(set) var routePoints: [RoutePoint] = []
    private(set) var heartRateSamples: [Int] = []
    private var workoutId: String?
    private var runId: String?
    private var displayTask: Task<Void, Never>?
    private var simulatorTickTask: Task<Void, Never>?
    private var watchdogTask: Task<Void, Never>?
    /// A sessão já começou e queremos pontos de GPS assim que a autorização sair.
    private var wantsLocationUpdates = false

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
        // CLLocationManager + HKHealthStore inicializam lazy quando precisar.
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        #if targetEnvironment(simulator)
        // Simulator: bypass total de HK/CL. Mock data não precisa de permissão.
        workoutLog.info("simulator: skip auth, granted automatically")
        hasPermission = true
        permissionError = nil
        return
        #else
        guard HKHealthStore.isHealthDataAvailable() else {
            permissionError = "HealthKit indisponível neste dispositivo."
            hasPermission = false
            return
        }
        do {
            try await healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead)

            // IMPORTANTE: requestAuthorization NÃO lança quando o usuário nega —
            // é comportamento documentado da Apple (só lança em erro de config).
            // Confiar no `try` dava um falso positivo em hasPermission. Por
            // privacidade só dá pra inspecionar os tipos de ESCRITA; os de
            // leitura sempre reportam .notDetermined mesmo quando concedidos.
            let deniedShare = typesToShare.filter {
                healthStore.authorizationStatus(for: $0) != .sharingAuthorized
            }
            if deniedShare.isEmpty {
                hasPermission = true
                permissionError = nil
            } else {
                hasPermission = false
                permissionError = "Permita que o RunEasy salve treinos em Ajustes → Privacidade → Saúde."
                workoutLog.error("share auth negada para \(deniedShare.count, privacy: .public) tipo(s)")
            }

            // Não-bloqueante: o start de updates acontece no callback de
            // autorização (locationManagerDidChangeAuthorization), não aqui.
            // Antes o código assumia permissão concedida na linha seguinte e
            // chamava startUpdatingLocation antes da resposta → rota vazia.
            if locationManager.authorizationStatus == .notDetermined {
                locationManager.requestWhenInUseAuthorization()
            }
        } catch {
            permissionError = "Falha ao solicitar permissão de Saúde: \(error.localizedDescription)"
            hasPermission = false
            workoutLog.error("requestAuthorization erro: \(error.localizedDescription, privacy: .public)")
        }
        #endif
    }

    // MARK: - Lifecycle

    /// Disparado pelo botão de play na tela de tracking.
    func startWorkout(workoutId: String?) async {
        guard phase == .idle || isFailed else {
            workoutLog.info("startWorkout ignorado, phase=\(String(describing: self.phase), privacy: .public)")
            return
        }

        phase = .authorizing

        #if targetEnvironment(simulator)
        hasPermission = true
        self.workoutId = workoutId
        self.runId = UUID().uuidString
        self.startDate = Date()
        self.phase = .starting
        await startSimulatedWorkout()
        return
        #else
        if !hasPermission {
            await requestAuthorization()
            guard hasPermission else {
                phase = .failed(permissionError ?? "Permissão de Saúde negada.")
                return
            }
        }
        self.workoutId = workoutId
        self.runId = UUID().uuidString
        self.startDate = Date()
        self.phase = .starting
        workoutLog.info("startWorkout runId=\(self.runId ?? "missing", privacy: .public) workoutId=\(workoutId ?? "free", privacy: .public)")
        await startRealWorkout()
        #endif
    }

    private var isFailed: Bool {
        if case .failed = phase { return true }
        return false
    }

    /// Volta ao estado ocioso para o usuário poder tentar de novo sem sair da tela.
    func reset() {
        watchdogTask?.cancel(); watchdogTask = nil
        displayTask?.cancel(); displayTask = nil
        simulatorTickTask?.cancel(); simulatorTickTask = nil
        session = nil
        builder = nil
        routeBuilder = nil
        workoutId = nil
        runId = nil
        wantsLocationUpdates = false
        metrics = RunMetrics()
        routePoints = []
        heartRateSamples = []
        sessionState = .notStarted
        permissionError = nil
        phase = .idle
        workoutLog.info("reset() → idle")
    }

    private func startRealWorkout() async {
        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor

        startWatchdog()

        do {
            let newSession = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let newBuilder = newSession.associatedWorkoutBuilder()
            newBuilder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)

            session = newSession
            builder = newBuilder
            routeBuilder = newBuilder.seriesBuilder(for: HKSeriesType.workoutRoute()) as? HKWorkoutRouteBuilder

            newSession.delegate = self
            newBuilder.delegate = self

            let now = startDate ?? Date()
            workoutLog.info("startActivity…")
            newSession.startActivity(with: now)
            workoutLog.info("beginCollection…")
            try await newBuilder.beginCollection(at: now)
            workoutLog.info("beginCollection OK")

            guard phase == .starting else {
                newSession.end()
                workoutLog.error("início concluído após timeout; sessão abortada")
                return
            }

            watchdogTask?.cancel(); watchdogTask = nil

            wantsLocationUpdates = true
            startLocationUpdatesIfAuthorized()
            phase = .running
            startDisplayTimer()
        } catch {
            watchdogTask?.cancel(); watchdogTask = nil
            session?.end()
            locationManager.stopUpdatingLocation()
            wantsLocationUpdates = false
            session = nil
            builder = nil
            routeBuilder = nil
            workoutLog.error("falha ao iniciar: \(error.localizedDescription, privacy: .public)")
            phase = .failed("Não foi possível iniciar o treino: \(error.localizedDescription)")
        }
    }

    /// Rede de segurança: se a sessão não sair de `.starting` dentro do limite,
    /// entrega uma tela de erro navegável em vez de deixar a UI presa.
    private func startWatchdog() {
        watchdogTask?.cancel()
        watchdogTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.startTimeoutSeconds * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            guard self.phase == .starting else { return }
            workoutLog.error("watchdog: sessão presa em .starting por \(Self.startTimeoutSeconds, privacy: .public)s")
            self.session?.end()
            self.locationManager.stopUpdatingLocation()
            self.wantsLocationUpdates = false
            self.phase = .failed(
                "O treino não iniciou. Verifique as permissões de Saúde e Localização do RunEasy no Apple Watch."
            )
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
        guard let session else { return }
        session.pause()
        #endif
    }

    func resume() {
        #if targetEnvironment(simulator)
        metrics.isPaused = false
        sessionState = .running
        #else
        guard let session else { return }
        session.resume()
        #endif
    }

    /// Finaliza a sessão e retorna o payload pronto pra enviar ao iPhone.
    func endWorkout() async -> CompletedRun {
        watchdogTask?.cancel()
        watchdogTask = nil
        displayTask?.cancel()
        displayTask = nil
        simulatorTickTask?.cancel()
        simulatorTickTask = nil

        let endDate = Date()

        var healthKitSaved = true
        var routeSaved = true
        var completionWarning: String?

        #if !targetEnvironment(simulator)
        healthKitSaved = false
        routeSaved = false
        if let session {
            session.end()
        }
        do {
            guard let builder else {
                throw WorkoutFinalizationError.missingBuilder
            }
            try await builder.endCollection(at: endDate)
            guard let savedWorkout = try await builder.finishWorkout() else {
                throw WorkoutFinalizationError.workoutNotSaved
            }
            healthKitSaved = true

            if routePoints.isEmpty {
                completionWarning = "Treino salvo sem rota GPS. Verifique a permissão de Localização."
            } else {
                if let routeBuilder {
                    do {
                        _ = try await routeBuilder.finishRoute(with: savedWorkout, metadata: [
                            "com.oytotec.runeasy.run_id": runId ?? "unknown"
                        ])
                        routeSaved = true
                    } catch {
                        routeSaved = false
                        completionWarning = "Treino salvo, mas a rota GPS não pôde ser anexada."
                        workoutLog.error("erro ao finalizar rota: \(error.localizedDescription, privacy: .public)")
                    }
                } else {
                    routeSaved = false
                    completionWarning = "Treino salvo, mas a rota GPS não pôde ser anexada."
                    workoutLog.error("route builder indisponível durante a finalização")
                }
            }
        } catch {
            healthKitSaved = false
            routeSaved = false
            completionWarning = "A corrida será enviada ao iPhone, mas não foi confirmada no app Saúde."
            workoutLog.error("erro ao finalizar: \(error.localizedDescription, privacy: .public)")
        }
        if session != nil {
            locationManager.stopUpdatingLocation()
        }
        wantsLocationUpdates = false
        #endif

        phase = .finished

        let avgHr = heartRateSamples.isEmpty
            ? nil
            : heartRateSamples.reduce(0, +) / heartRateSamples.count

        let payload = CompletedRun(
            runId: runId ?? UUID().uuidString,
            workoutId: workoutId,
            totalDistanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.elapsedSeconds,
            avgPaceSecondsPerKm: metrics.avgPaceSecondsPerKm,
            avgHeartRate: avgHr,
            maxHeartRate: metrics.maxHeartRate > 0 ? metrics.maxHeartRate : nil,
            calories: metrics.calories > 0 ? metrics.calories : nil,
            routePoints: routePoints,
            startedAt: ISO8601DateFormatter().string(from: startDate ?? endDate),
            source: "apple_watch",
            healthKitSaved: healthKitSaved,
            routeSaved: routeSaved,
            completionWarning: completionWarning
        )
        workoutLog.info("endWorkout dist=\(self.metrics.distanceMeters, privacy: .public)m dur=\(self.metrics.elapsedSeconds, privacy: .public)s pts=\(self.routePoints.count, privacy: .public)")
        return payload
    }

    // MARK: - Helpers (real device)

    private func startLocationUpdatesIfAuthorized() {
        #if !targetEnvironment(simulator)
        guard wantsLocationUpdates else { return }
        let status = locationManager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            workoutLog.info("GPS aguardando autorização (status=\(status.rawValue, privacy: .public))")
            return
        }
        locationManager.startUpdatingLocation()
        workoutLog.info("GPS iniciado")
        #endif
    }

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
        workoutLog.info("startSimulatedWorkout: spinning mock tick")
        phase = .running
        sessionState = .running
        metrics.isPaused = false
        simulatorTickTask?.cancel()
        simulatorTickTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self else { return }
                if self.metrics.isPaused { continue }
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
        // FC oscilando 130–160 BPM.
        // NÃO chamar de `phase`: sombrearia a @Published var phase da classe.
        let hrPhase = Double(metrics.elapsedSeconds) / 8.0
        let hr = 145 + Int((sin(hrPhase) * 15).rounded())
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
            workoutLog.info("session \(fromState.rawValue, privacy: .public) → \(toState.rawValue, privacy: .public)")
            sessionState = toState
            metrics.isPaused = (toState == .paused)
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            workoutLog.error("session falhou: \(error.localizedDescription, privacy: .public)")
            watchdogTask?.cancel()
            watchdogTask = nil
            permissionError = error.localizedDescription
            phase = .failed("A sessão de treino falhou: \(error.localizedDescription)")
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
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            // A autorização costuma sair DEPOIS do play. Quando sair, liga o GPS
            // se a sessão já estiver rodando.
            self.startLocationUpdatesIfAuthorized()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let filtered = locations.filter { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy < 50 }
        guard !filtered.isEmpty else { return }

        let points = filtered.map { RoutePoint(from: $0) }
        Task { @MainActor in
            self.routePoints.append(contentsOf: points)
            // Acessar routeBuilder no MainActor (insertRouteData é async, await ok aqui)
            if let builder = self.routeBuilder {
                do {
                    try await builder.insertRouteData(filtered)
                } catch {
                    workoutLog.error("erro ao inserir rota: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        workoutLog.error("GPS erro: \(error.localizedDescription, privacy: .public)")
    }
}

private enum WorkoutFinalizationError: LocalizedError {
    case missingBuilder
    case workoutNotSaved

    var errorDescription: String? {
        switch self {
        case .missingBuilder: return "Workout builder indisponível"
        case .workoutNotSaved: return "HealthKit não retornou o workout salvo"
        }
    }
}

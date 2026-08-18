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
        case finalizing
        case finished
    }

    private enum AuthorizationPreparation {
        case ready
        case request
        case failed(String)
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
    // Store única para toda a vida do manager; Core Location continua lazy para
    // não criar o delegate/run loop antes do Play.

    /// Uma única store, com a mesma vida útil do manager raiz.
    private let authorizationStore = HKHealthStore()
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
    private var finalizationTask: Task<CompletedRun, Never>?
    private var finalizedRun: CompletedRun?
    private var stopTimeoutTask: Task<Void, Never>?
    private var stoppedContinuation: CheckedContinuation<Date, Never>?
    /// A sessão já começou e queremos pontos de GPS assim que a autorização sair.
    private var wantsLocationUpdates = false

    // Tipos lidos/escritos
    private var authorizationShareTypes: Set<HKSampleType> {
        [HKObjectType.workoutType(), HKSeriesType.workoutRoute()]
    }
    private var authorizationReadTypes: Set<HKObjectType> {
        [
            HKObjectType.workoutType(),
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKSeriesType.workoutRoute()
        ]
    }

    override init() {
        super.init()
        WatchLaunchDiagnostics.mark("health.store.ready")
    }

    // MARK: - Authorization

    /// Prepara o fluxo iniciado pelo Play. No watchOS a autorização é pedida
    /// pela própria HKHealthStore, depois que a tela e os controles estabilizam.
    func prepareWorkoutStart(workoutId: String?) async {
        guard phase == .idle || isFailed else {
            workoutLog.info("prepareWorkoutStart ignorado, phase=\(String(describing: self.phase), privacy: .public)")
            return
        }

        phase = .authorizing
        self.workoutId = workoutId
        WatchLaunchDiagnostics.mark("workout.start-requested")

        #if targetEnvironment(simulator)
        workoutLog.info("simulator: skip auth, granted automatically")
        hasPermission = true
        permissionError = nil
        WatchLaunchDiagnostics.mark("health.auth.simulator-granted")
        beginPreparedWorkout()
        await startSimulatedWorkout()
        return
        #else
        switch await prepareHealthAuthorization() {
        case .ready:
            beginPreparedWorkout()
            await startRealWorkout()
            return
        case .request:
            await requestHealthAuthorizationAndStart()
            return
        case .failed(let message):
            failAuthorization(message)
            return
        }
        #endif
    }

    private func requestHealthAuthorizationAndStart() async {
        guard phase == .authorizing else { return }

        do {
            WatchLaunchDiagnostics.mark("health.auth.request-will-present")
            try await authorizationStore.requestAuthorization(
                toShare: authorizationShareTypes,
                read: authorizationReadTypes
            )
            WatchLaunchDiagnostics.mark("health.auth.request-completed")
            WatchLaunchDiagnostics.mark("health.auth.authorization-check")
            guard workoutWriteAuthorization == .sharingAuthorized else {
                WatchLaunchDiagnostics.mark("health.auth.denied-workout")
                failAuthorization("Permita que o RunEasy salve treinos em Ajustes → Privacidade → Saúde.")
                return
            }
            hasPermission = true
            permissionError = nil
            WatchLaunchDiagnostics.mark("health.auth.ready")
            beginPreparedWorkout()
            await startRealWorkout()
        } catch {
            workoutLog.error("autorização HealthKit falhou: \(error.localizedDescription, privacy: .public)")
            WatchLaunchDiagnostics.mark("health.auth.request-error")
            failAuthorization("Falha ao solicitar permissão de Saúde: \(error.localizedDescription)")
        }
    }

    private func prepareHealthAuthorization() async -> AuthorizationPreparation {
        WatchLaunchDiagnostics.mark("health.availability.check")
        guard HKHealthStore.isHealthDataAvailable() else {
            WatchLaunchDiagnostics.mark("health.availability.unavailable")
            return .failed("HealthKit indisponível neste dispositivo.")
        }
        WatchLaunchDiagnostics.mark("health.availability.available")

        let shareTypes = authorizationShareTypes
        let readTypes = authorizationReadTypes
        WatchLaunchDiagnostics.mark("health.types.ready")

        do {
            WatchLaunchDiagnostics.mark("health.auth.status-check")
            let requestStatus = try await authorizationRequestStatus(
                shareTypes: shareTypes,
                readTypes: readTypes
            )
            WatchLaunchDiagnostics.mark("health.auth.status-\(requestStatus.rawValue)")

            switch requestStatus {
            case .shouldRequest:
                return .request
            case .unnecessary:
                switch workoutWriteAuthorization {
                case .sharingAuthorized:
                    hasPermission = true
                    permissionError = nil
                    WatchLaunchDiagnostics.mark("health.auth.already-ready")
                    return .ready
                case .sharingDenied:
                    return .failed("Permita que o RunEasy salve treinos em Ajustes → Privacidade → Saúde.")
                case .notDetermined:
                    // Estado defensivo: se o status agregado e o tipo obrigatório
                    // divergirem, deixa o HealthKit apresentar a decisão.
                    return .request
                @unknown default:
                    return .request
                }
            case .unknown:
                return .request
            @unknown default:
                return .request
            }
        } catch {
            workoutLog.error("status de autorização falhou: \(error.localizedDescription, privacy: .public)")
            WatchLaunchDiagnostics.mark("health.auth.status-error")
            return .failed("Não foi possível verificar as permissões de Saúde: \(error.localizedDescription)")
        }
    }

    private var workoutWriteAuthorization: HKAuthorizationStatus {
        authorizationStore.authorizationStatus(for: HKObjectType.workoutType())
    }

    private func authorizationRequestStatus(
        shareTypes: Set<HKSampleType>,
        readTypes: Set<HKObjectType>
    ) async throws -> HKAuthorizationRequestStatus {
        try await withCheckedThrowingContinuation { continuation in
            authorizationStore.getRequestStatusForAuthorization(
                toShare: shareTypes,
                read: readTypes
            ) { status, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: status)
                }
            }
        }
    }

    private func failAuthorization(_ message: String) {
        hasPermission = false
        permissionError = message
        phase = .failed(message)
        WatchLaunchDiagnostics.mark("workout.failed")
    }

    private func beginPreparedWorkout() {
        runId = UUID().uuidString
        startDate = Date()
        phase = .starting
    }

    // MARK: - Lifecycle

    private var isFailed: Bool {
        if case .failed = phase { return true }
        return false
    }

    /// Volta ao estado ocioso para o usuário poder tentar de novo sem sair da tela.
    func reset() {
        watchdogTask?.cancel(); watchdogTask = nil
        finalizationTask?.cancel(); finalizationTask = nil
        finalizedRun = nil
        stopTimeoutTask?.cancel(); stopTimeoutTask = nil
        resolveStoppedContinuation(with: Date())
        displayTask?.cancel(); displayTask = nil
        simulatorTickTask?.cancel(); simulatorTickTask = nil
        if session != nil {
            session?.end()
            locationManager.stopUpdatingLocation()
        }
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
            WatchLaunchDiagnostics.mark("session.create.begin")
            let newSession = try HKWorkoutSession(healthStore: authorizationStore, configuration: config)
            WatchLaunchDiagnostics.mark("session.create.end")
            WatchLaunchDiagnostics.mark("builder.configure.begin")
            let newBuilder = newSession.associatedWorkoutBuilder()
            newBuilder.dataSource = HKLiveWorkoutDataSource(healthStore: authorizationStore, workoutConfiguration: config)

            session = newSession
            builder = newBuilder
            routeBuilder = newBuilder.seriesBuilder(for: HKSeriesType.workoutRoute()) as? HKWorkoutRouteBuilder

            newSession.delegate = self
            newBuilder.delegate = self
            WatchLaunchDiagnostics.mark("builder.configure.end")

            let now = startDate ?? Date()
            workoutLog.info("startActivity…")
            WatchLaunchDiagnostics.mark("session.start-activity")
            newSession.startActivity(with: now)
            workoutLog.info("beginCollection…")
            WatchLaunchDiagnostics.mark("builder.begin-collection")
            try await newBuilder.beginCollection(at: now)
            workoutLog.info("beginCollection OK")
            WatchLaunchDiagnostics.mark("builder.collection-started")

            guard phase == .starting else {
                newSession.end()
                workoutLog.error("início concluído após timeout; sessão abortada")
                return
            }

            watchdogTask?.cancel(); watchdogTask = nil

            wantsLocationUpdates = true
            phase = .running
            startDisplayTimer()
            WatchLaunchDiagnostics.mark("workout.running")
            requestLocationOrStartUpdates()
        } catch {
            watchdogTask?.cancel(); watchdogTask = nil
            session?.end()
            locationManager.stopUpdatingLocation()
            wantsLocationUpdates = false
            session = nil
            builder = nil
            routeBuilder = nil
            workoutLog.error("falha ao iniciar: \(error.localizedDescription, privacy: .public)")
            WatchLaunchDiagnostics.mark("workout.start.error")
            phase = .failed("Não foi possível iniciar o treino: \(error.localizedDescription)")
            WatchLaunchDiagnostics.mark("workout.failed")
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
            WatchLaunchDiagnostics.mark("workout.failed")
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
        if let finalizedRun {
            return finalizedRun
        }
        if let finalizationTask {
            return await finalizationTask.value
        }

        let task = Task { @MainActor [self] in
            await self.finishWorkoutOnce()
        }
        finalizationTask = task
        let run = await task.value
        finalizedRun = run
        finalizationTask = nil
        return run
    }

    private func finishWorkoutOnce() async -> CompletedRun {
        // Troca a UI imediatamente para "Finalizando…" e remove os controles,
        // impedindo pausa/finalização duplicada enquanto o HealthKit persiste.
        phase = .finalizing
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
        locationManager.stopUpdatingLocation()
        wantsLocationUpdates = false
        do {
            guard let session else {
                throw WorkoutFinalizationError.missingSession
            }
            guard let builder else {
                throw WorkoutFinalizationError.missingBuilder
            }

            // `.stopped` mantém o builder vivo para persistir a amostra. Chamar
            // `session.end()` antes de finishWorkout perde/racea o treino.
            WatchLaunchDiagnostics.mark("workout.stop-requested")
            let stoppedAt = await stopWorkoutSession(session, at: endDate)

            WatchLaunchDiagnostics.mark("builder.end-collection")
            try await builder.endCollection(at: stoppedAt)
            WatchLaunchDiagnostics.mark("builder.finish-workout")
            guard let savedWorkout = try await builder.finishWorkout() else {
                throw WorkoutFinalizationError.workoutNotSaved
            }
            healthKitSaved = true
            session.end()
            WatchLaunchDiagnostics.mark("session.ended")

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
            session?.end()
            healthKitSaved = false
            routeSaved = false
            completionWarning = "A corrida será enviada ao iPhone, mas não foi confirmada no app Saúde."
            workoutLog.error("erro ao finalizar: \(error.localizedDescription, privacy: .public)")
        }
        #endif

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
        WatchLaunchDiagnostics.mark("workout.finished")
        phase = .finished
        return payload
    }

    private func stopWorkoutSession(_ session: HKWorkoutSession, at date: Date) async -> Date {
        await withCheckedContinuation { continuation in
            stoppedContinuation = continuation
            stopTimeoutTask?.cancel()
            stopTimeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(5))
                guard let self, !Task.isCancelled else { return }
                workoutLog.error("timeout aguardando HKWorkoutSession.stopped")
                WatchLaunchDiagnostics.mark("workout.stop-timeout")
                self.resolveStoppedContinuation(with: date)
            }
            session.stopActivity(with: date)
        }
    }

    private func resolveStoppedContinuation(with date: Date) {
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        let continuation = stoppedContinuation
        stoppedContinuation = nil
        continuation?.resume(returning: date)
    }

    // MARK: - Helpers (real device)

    private func requestLocationOrStartUpdates() {
        #if !targetEnvironment(simulator)
        if locationManager.authorizationStatus == .notDetermined {
            WatchLaunchDiagnostics.mark("location.auth.request")
            locationManager.requestWhenInUseAuthorization()
        } else {
            startLocationUpdatesIfAuthorized()
        }
        #endif
    }

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
        WatchLaunchDiagnostics.mark("workout.running")
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
            guard self.session === workoutSession else {
                workoutLog.info("callback ignorado de HKWorkoutSession antiga")
                return
            }
            workoutLog.info("session \(fromState.rawValue, privacy: .public) → \(toState.rawValue, privacy: .public)")
            sessionState = toState
            metrics.isPaused = (toState == .paused)
            if toState == .stopped {
                WatchLaunchDiagnostics.mark("workout.stopped")
                resolveStoppedContinuation(with: date)
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            guard self.session === workoutSession else {
                workoutLog.info("erro ignorado de HKWorkoutSession antiga")
                return
            }
            workoutLog.error("session falhou: \(error.localizedDescription, privacy: .public)")
            watchdogTask?.cancel()
            watchdogTask = nil
            permissionError = error.localizedDescription
            if phase == .finalizing {
                WatchLaunchDiagnostics.mark("workout.finalization-session-error")
                resolveStoppedContinuation(with: Date())
                return
            }
            phase = .failed("A sessão de treino falhou: \(error.localizedDescription)")
            WatchLaunchDiagnostics.mark("workout.failed")
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor in
            guard self.builder === workoutBuilder else {
                workoutLog.info("dados ignorados de HKLiveWorkoutBuilder antigo")
                return
            }
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
    case missingSession
    case missingBuilder
    case workoutNotSaved

    var errorDescription: String? {
        switch self {
        case .missingSession: return "Sessão de treino indisponível"
        case .missingBuilder: return "Workout builder indisponível"
        case .workoutNotSaved: return "HealthKit não retornou o workout salvo"
        }
    }
}

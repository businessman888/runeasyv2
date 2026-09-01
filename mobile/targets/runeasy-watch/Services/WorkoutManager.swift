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
    let coachController = WatchCoachController()

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
    @Published private(set) var hasRecoveredSession: Bool = false
    @Published private(set) var isRecoveryPending: Bool = false
    @Published private(set) var pendingCompletedRun: CompletedRun?
    @Published private(set) var liveRoutePresentation = LiveRoutePresentation.empty
    @Published private(set) var liveRouteLocationState: LiveRouteLocationState = .seeking
    @Published private(set) var coachSessionIsAvailable = false
    @Published private(set) var coachSessionIsMuted = false

    var isRunning: Bool { phase == .running }

    // MARK: - HealthKit / GPS
    // Store única para toda a vida do manager; Core Location continua lazy para
    // não criar o delegate/run loop antes do Play.

    /// Uma única store, com a mesma vida útil do manager raiz.
    private let authorizationStore = HKHealthStore()
    private let checkpointStore = ActiveWorkoutCheckpointStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var routeBuilder: HKWorkoutRouteBuilder?
    private lazy var routeRecorder = WorkoutRouteRecorder(checkpointStore: checkpointStore)
    private lazy var locationManager: CLLocationManager = {
        let lm = CLLocationManager()
        lm.delegate = self
        lm.desiredAccuracy = kCLLocationAccuracyBest
        lm.activityType = .fitness
        lm.allowsBackgroundLocationUpdates = true
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
    private var stoppedContinuation: CheckedContinuation<WorkoutStopResult, Never>?
    /// A sessão já começou e queremos pontos de GPS assim que a autorização sair.
    private var wantsLocationUpdates = false
    /// Descarta coordenadas que o Core Location tenha armazenado antes do resume.
    private var locationCutoffDate = Date.distantPast
    private var liveRouteSegments: [[RoutePoint]] = []
    private var startsNewLiveRouteSegment = true
    private var lastLiveRoutePublishAt = Date.distantPast
    private var liveRouteRevision = 0
    private var lastLocationAccuracy: Double?
    private var lastLocationUpdatedAt: Date?
    private var isCoachEnabledForCurrentWorkout = false
    private var coachConfiguration = WatchCoachSessionConfiguration.disabled

    private static let liveRoutePublishInterval: TimeInterval = 3
    private static let liveRouteMaximumPoints = 240
    private static let liveRouteCompactionThreshold = 480
    private static let acceptedLocationAccuracyMeters = 50.0
    private static let locationFreshnessSeconds: TimeInterval = 15
    private static let healthKitSaveTimeoutSeconds: TimeInterval = 12
    private static let routeFinishTimeoutSeconds: TimeInterval = 8

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
        guard await beginPreparedWorkout() else { return }
        await startSimulatedWorkout()
        return
        #else
        switch await prepareHealthAuthorization() {
        case .ready:
            guard await beginPreparedWorkout() else { return }
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
            guard await beginPreparedWorkout() else { return }
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

    private func beginPreparedWorkout() async -> Bool {
        let nextRunId = UUID().uuidString
        let nextStartDate = Date()
        let context = ActiveWorkoutContext(
            runId: nextRunId,
            workoutId: workoutId,
            startDate: nextStartDate,
            coachEnabled: isCoachEnabledForCurrentWorkout,
            coachConfiguration: coachConfiguration
        )

        do {
            try await checkpointStore.begin(context)
            runId = nextRunId
            startDate = nextStartDate
            routePoints = []
            resetLiveRoute()
            resetLiveRouteLocationState()
            phase = .starting
            WatchLaunchDiagnostics.mark("workout.checkpoint-created")
            return true
        } catch {
            workoutLog.error("falha ao criar checkpoint: \(error.localizedDescription, privacy: .public)")
            phase = .failed("Não foi possível preparar o armazenamento seguro do treino.")
            WatchLaunchDiagnostics.mark("workout.checkpoint-error")
            return false
        }
    }

    // MARK: - Lifecycle

    private var isFailed: Bool {
        if case .failed = phase { return true }
        return false
    }

    /// Volta ao estado ocioso para o usuário poder tentar de novo sem sair da tela.
    func reset() {
        if phase == .running || phase == .starting || phase == .finalizing
            || sessionState == .running || sessionState == .paused {
            workoutLog.error("reset() recusado: sessão ativa exige finalização coordenada")
            WatchLaunchDiagnostics.mark("workout.reset-refused-active-session")
            return
        }

        watchdogTask?.cancel(); watchdogTask = nil
        finalizationTask?.cancel(); finalizationTask = nil
        finalizedRun = nil
        stopTimeoutTask?.cancel(); stopTimeoutTask = nil
        resolveStoppedContinuation(with: Date(), confirmed: false)
        displayTask?.cancel(); displayTask = nil
        simulatorTickTask?.cancel(); simulatorTickTask = nil
        if session != nil {
            session?.end()
            locationManager.stopUpdatingLocation()
        }
        session = nil
        builder = nil
        routeBuilder = nil
        routeRecorder.invalidate()
        workoutId = nil
        runId = nil
        wantsLocationUpdates = false
        locationCutoffDate = .distantPast
        hasRecoveredSession = false
        isRecoveryPending = false
        metrics = RunMetrics()
        coachController.stop()
        isCoachEnabledForCurrentWorkout = false
        coachConfiguration = .disabled
        coachSessionIsAvailable = false
        coachSessionIsMuted = false
        routePoints = []
        resetLiveRoute()
        resetLiveRouteLocationState()
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
            routeRecorder.open(routeBuilder: routeBuilder)

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
            locationCutoffDate = now
            phase = .running
            coachController.begin(
                enabled: isCoachEnabledForCurrentWorkout,
                audioOwner: coachConfiguration.audioOwner,
                policy: coachConfiguration.policy,
                initialMuted: coachConfiguration.isMuted,
                distanceMeters: metrics.distanceMeters,
                elapsedSeconds: metrics.elapsedSeconds
            )
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
            routeRecorder.invalidate()
            await checkpointStore.clear()
            workoutLog.error("falha ao iniciar: \(error.localizedDescription, privacy: .public)")
            WatchLaunchDiagnostics.mark("workout.start.error")
            phase = .failed("Não foi possível iniciar o treino: \(error.localizedDescription)")
            WatchLaunchDiagnostics.mark("workout.failed")
        }
    }

    /// Reconecta a UI ao workout que o watchOS manteve ativo após o processo
    /// ser encerrado. Não reinicia a sessão nem a coleta do builder.
    func beginRecovery() -> Bool {
        guard session == nil, phase == .idle, !isRecoveryPending else { return false }
        isRecoveryPending = true
        WatchLaunchDiagnostics.mark("recovery.requested")
        return true
    }

    func recoverActiveWorkout() async {
        #if targetEnvironment(simulator)
        isRecoveryPending = false
        return
        #else
        guard isRecoveryPending, session == nil, phase == .idle else { return }

        do {
            guard let recoveredSession = try await authorizationStore.recoverActiveWorkoutSession() else {
                await checkpointStore.clear()
                isRecoveryPending = false
                WatchLaunchDiagnostics.mark("recovery.none")
                return
            }
            let recoveredBuilder = recoveredSession.associatedWorkoutBuilder()
            let recoveredRouteBuilder = recoveredBuilder.seriesBuilder(
                for: HKSeriesType.workoutRoute()
            ) as? HKWorkoutRouteBuilder
            session = recoveredSession
            builder = recoveredBuilder
            routeBuilder = recoveredRouteBuilder

            recoveredSession.delegate = self
            recoveredBuilder.delegate = self
            recoveredBuilder.dataSource = HKLiveWorkoutDataSource(
                healthStore: authorizationStore,
                workoutConfiguration: recoveredSession.workoutConfiguration
            )

            let snapshot = await checkpointStore.load()
            let recoveredRunId = snapshot.context?.runId ?? UUID().uuidString
            let recoveredStartDate = snapshot.context?.startDate
                ?? recoveredSession.startDate
                ?? Date()
            runId = recoveredRunId
            workoutId = snapshot.context?.workoutId
            startDate = recoveredStartDate
            if snapshot.context == nil {
                try? await checkpointStore.updateContextPreservingRoute(
                    ActiveWorkoutContext(
                        runId: recoveredRunId,
                        workoutId: nil,
                        startDate: recoveredStartDate,
                        coachEnabled: false,
                        coachConfiguration: .disabled
                    )
                )
            }
            coachConfiguration = snapshot.context?.coachConfiguration
                ?? WatchCoachSessionConfiguration(
                    enabled: snapshot.context?.coachEnabled ?? false,
                    audioOwner: .none,
                    policy: .standard,
                    isMuted: false
                )
            isCoachEnabledForCurrentWorkout = coachConfiguration.enabled
            coachSessionIsAvailable = coachConfiguration.enabled
                && coachConfiguration.audioOwner == .watch
            coachSessionIsMuted = coachConfiguration.isMuted
            routePoints = snapshot.routePoints
            restoreLiveRoute(from: snapshot.routeSegments)
            try? await checkpointStore.recordSegmentBoundary(
                pointIndex: snapshot.routePoints.count
            )
            routeRecorder.open(
                routeBuilder: recoveredRouteBuilder,
                mayContainPreexistingRouteData: true
            )

            sessionState = recoveredSession.state
            metrics.elapsedSeconds = Int(recoveredBuilder.elapsedTime.rounded())
            hydrateMetrics(from: recoveredBuilder)
            metrics.isPaused = recoveredSession.state == .paused
            if metrics.isPaused {
                liveRouteLocationState = .paused(
                    horizontalAccuracy: routePoints.last?.accuracy,
                    lastUpdatedAt: routePoints.last.map {
                        Date(timeIntervalSince1970: $0.timestamp / 1000)
                    }
                )
            }
            hasPermission = true
            hasRecoveredSession = true
            isRecoveryPending = false
            phase = .running
            coachController.begin(
                enabled: isCoachEnabledForCurrentWorkout,
                audioOwner: coachConfiguration.audioOwner,
                policy: coachConfiguration.policy,
                initialMuted: coachConfiguration.isMuted,
                distanceMeters: metrics.distanceMeters,
                elapsedSeconds: metrics.elapsedSeconds
            )
            locationCutoffDate = Date()
            wantsLocationUpdates = recoveredSession.state == .running
            startDisplayTimer()

            if wantsLocationUpdates {
                startLocationUpdatesIfAuthorized()
            }
            WatchLaunchDiagnostics.mark("recovery.attached")
        } catch {
            workoutLog.info("nenhuma sessão ativa recuperável: \(error.localizedDescription, privacy: .public)")
            await checkpointStore.clear()
            isRecoveryPending = false
            WatchLaunchDiagnostics.mark("recovery.none")
        }
        #endif
    }

    private func hydrateMetrics(from builder: HKLiveWorkoutBuilder) {
        let types: [HKQuantityType] = [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning)
        ]
        for type in types {
            updateMetrics(from: builder.statistics(for: type))
        }

        if let heartRate = builder.statistics(for: HKQuantityType(.heartRate)) {
            let unit = HKUnit.count().unitDivided(by: .minute())
            if let maximum = heartRate.maximumQuantity()?.doubleValue(for: unit) {
                metrics.maxHeartRate = Int(maximum.rounded())
            }
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
                self.refreshLocationFreshness()
            }
        }
    }

    func pause() {
        #if targetEnvironment(simulator)
        metrics.isPaused = true
        sessionState = .paused
        beginNewLiveRouteSegmentAfterPause()
        coachController.pause()
        #else
        guard let session else { return }
        session.pause()
        #endif
    }

    func resume() {
        #if targetEnvironment(simulator)
        metrics.isPaused = false
        sessionState = .running
        if let accuracy = lastLocationAccuracy,
           let updatedAt = lastLocationUpdatedAt {
            liveRouteLocationState = .active(
                horizontalAccuracy: accuracy,
                lastUpdatedAt: updatedAt
            )
        } else {
            liveRouteLocationState = .seeking
        }
        #else
        guard let session else { return }
        session.resume()
        #endif
    }

    func configureCoach(
        enabled: Bool,
        audioOwner: WatchCoachAudioOwner,
        policy: WatchCoachRuntimePolicy
    ) {
        guard phase == .idle else { return }
        coachConfiguration = WatchCoachSessionConfiguration(
            enabled: enabled,
            audioOwner: enabled ? audioOwner : .none,
            policy: policy,
            isMuted: false
        )
        isCoachEnabledForCurrentWorkout = coachConfiguration.enabled
        coachSessionIsAvailable = coachConfiguration.enabled
            && coachConfiguration.audioOwner == .watch
        coachSessionIsMuted = false
    }

    func toggleCoachMuted() {
        guard phase == .running, coachConfiguration.enabled else { return }
        coachController.toggleMuted()
        coachConfiguration.isMuted = coachController.isMuted
        coachSessionIsMuted = coachConfiguration.isMuted
        persistCoachConfiguration()
    }

    private func persistCoachConfiguration() {
        guard let runId, let startDate else { return }
        let context = ActiveWorkoutContext(
            runId: runId,
            workoutId: workoutId,
            startDate: startDate,
            coachEnabled: coachConfiguration.enabled,
            coachConfiguration: coachConfiguration
        )
        Task {
            try? await checkpointStore.updateContextPreservingRoute(context)
        }
    }

    private func resetLiveRoute() {
        liveRouteSegments = []
        startsNewLiveRouteSegment = true
        lastLiveRoutePublishAt = .distantPast
        liveRouteRevision += 1
        liveRoutePresentation = LiveRoutePresentation(
            segments: [],
            revision: liveRouteRevision
        )
    }

    private func resetLiveRouteLocationState() {
        lastLocationAccuracy = nil
        lastLocationUpdatedAt = nil
        liveRouteLocationState = .seeking
    }

    private func restoreLiveRoute(from segments: [[RoutePoint]]) {
        let restored = LiveRoutePresentation.make(
            from: segments,
            revision: liveRouteRevision + 1,
            maximumPointCount: Self.liveRouteMaximumPoints
        )
        liveRouteRevision = restored.revision
        liveRouteSegments = restored.segments.map(\.points)
        lastLocationAccuracy = restored.latestPoint?.accuracy
        lastLocationUpdatedAt = restored.latestPoint.map {
            Date(timeIntervalSince1970: $0.timestamp / 1000)
        }
        startsNewLiveRouteSegment = true
        lastLiveRoutePublishAt = Date()
        liveRoutePresentation = restored
    }

    private func beginNewLiveRouteSegmentAfterPause() {
        let boundary = routePoints.count
        startsNewLiveRouteSegment = true
        liveRouteLocationState = .paused(
            horizontalAccuracy: lastLocationAccuracy,
            lastUpdatedAt: lastLocationUpdatedAt
        )
        publishLiveRoute(force: true)
        Task {
            try? await checkpointStore.recordSegmentBoundary(pointIndex: boundary)
        }
    }

    private func appendLiveRoutePoints(_ points: [RoutePoint]) {
        guard !points.isEmpty else { return }
        if startsNewLiveRouteSegment || liveRouteSegments.isEmpty {
            liveRouteSegments.append([])
            startsNewLiveRouteSegment = false
        }
        liveRouteSegments[liveRouteSegments.count - 1].append(contentsOf: points)
        publishLiveRoute(force: liveRoutePresentation.pointCount < 2)
    }

    private func publishLiveRoute(force: Bool) {
        let now = Date()
        guard force
            || now.timeIntervalSince(lastLiveRoutePublishAt) >= Self.liveRoutePublishInterval
        else { return }

        liveRouteRevision += 1
        let presentation = LiveRoutePresentation.make(
            from: liveRouteSegments,
            revision: liveRouteRevision,
            maximumPointCount: Self.liveRouteMaximumPoints
        )
        if liveRouteSegments.reduce(0, { $0 + $1.count })
            > Self.liveRouteCompactionThreshold {
            liveRouteSegments = presentation.segments.map(\.points)
        }
        liveRoutePresentation = presentation
        lastLiveRoutePublishAt = now
    }

    /// Finaliza a sessão e retorna o payload pronto pra enviar ao iPhone.
    func endWorkout() async -> CompletedRun {
        coachController.stop()
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
        // Fecha a entrada antes de parar o Core Location: callbacks que já
        // estavam a caminho serão recusados, e os lotes aceitos são drenados.
        wantsLocationUpdates = false
        locationManager.stopUpdatingLocation()
        WatchLaunchDiagnostics.mark("route.drain.begin")
        let routeDrain = await routeRecorder.sealAndDrain()
        if routeDrain.timedOut {
            // Impede que a fila que excedeu o orçamento concorra com o
            // fechamento do builder. O journal bruto já preserva o que entrou.
            routeRecorder.invalidate()
        }
        WatchLaunchDiagnostics.mark(routeDrain.timedOut ? "route.drain.timeout" : "route.drain.completed")
        workoutLog.info(
            "route drain accepted=\(routeDrain.acceptedPointCount, privacy: .public) inserted=\(routeDrain.insertedPointCount, privacy: .public) rejected=\(routeDrain.rejectedPointCount, privacy: .public) timeout=\(routeDrain.timedOut, privacy: .public)"
        )
        if let insertionError = routeDrain.insertionError {
            workoutLog.error("route insert parcial: \(insertionError, privacy: .public)")
        }
        if let journalError = routeDrain.journalError {
            workoutLog.error("route journal parcial: \(journalError, privacy: .public)")
        }
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
            let stopResult = await stopWorkoutSession(session, at: endDate)
            guard stopResult.confirmed else {
                throw WorkoutFinalizationError.stopNotConfirmed
            }

            let savedWorkout = try await saveWorkoutWithDeadline(
                builder,
                at: stopResult.date
            )
            healthKitSaved = true

            if !routeDrain.hasRouteData {
                completionWarning = "Treino salvo sem rota GPS. Verifique a permissão de Localização."
            } else if routeDrain.timedOut {
                completionWarning = "Treino salvo, mas a rota GPS excedeu o tempo de finalização."
            } else {
                if let routeBuilder {
                    do {
                        WatchLaunchDiagnostics.mark("route.finish.begin")
                        try await finishRouteWithDeadline(
                            routeBuilder,
                            workout: savedWorkout,
                            metadata: [
                                "com.oytotec.runeasy.run_id": runId ?? "unknown"
                            ]
                        )
                        routeSaved = routeDrain.isComplete
                        if !routeDrain.isComplete {
                            completionWarning = "Treino salvo com rota GPS parcial."
                        }
                        WatchLaunchDiagnostics.mark("route.finish.completed")
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
            session.end()
            WatchLaunchDiagnostics.mark("session.ended")
        } catch {
            session?.end()
            healthKitSaved = false
            routeSaved = false
            completionWarning = "A corrida será enviada ao iPhone, mas não foi confirmada no app Saúde."
            workoutLog.error("erro ao finalizar: \(error.localizedDescription, privacy: .public)")
        }
        #endif

        let heartRateStatistics = builder?.statistics(for: HKQuantityType(.heartRate))
        let heartRateUnit = HKUnit.count().unitDivided(by: .minute())
        let avgHr = heartRateStatistics?.averageQuantity().map {
            Int($0.doubleValue(for: heartRateUnit).rounded())
        } ?? (heartRateSamples.isEmpty ? nil : heartRateSamples.reduce(0, +) / heartRateSamples.count)
        let recoveredMaxHr = heartRateStatistics?.maximumQuantity().map {
            Int($0.doubleValue(for: heartRateUnit).rounded())
        }

        let payload = CompletedRun(
            runId: runId ?? UUID().uuidString,
            workoutId: workoutId,
            totalDistanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.elapsedSeconds,
            avgPaceSecondsPerKm: metrics.avgPaceSecondsPerKm,
            avgHeartRate: avgHr,
            maxHeartRate: recoveredMaxHr ?? (metrics.maxHeartRate > 0 ? metrics.maxHeartRate : nil),
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
        hasRecoveredSession = false
        isRecoveryPending = false
        routeRecorder.invalidate()
        do {
            try await checkpointStore.savePendingCompletedRun(payload)
            pendingCompletedRun = payload
            await checkpointStore.clear()
            WatchLaunchDiagnostics.mark("completion.persisted")
        } catch {
            // Mantém context + rota como último recurso se nem o payload final
            // pôde ser persistido.
            workoutLog.error("falha ao persistir conclusão pendente: \(error.localizedDescription, privacy: .public)")
            WatchLaunchDiagnostics.mark("completion.persist-error")
        }
        phase = .finished
        return payload
    }

    func restorePendingCompletion() async {
        pendingCompletedRun = await checkpointStore.loadPendingCompletedRun()
    }

    func confirmCompletionEnqueued(runId: String) async {
        await checkpointStore.clearPendingCompletedRun(runId: runId)
        if pendingCompletedRun?.runId == runId {
            pendingCompletedRun = nil
        }
        WatchLaunchDiagnostics.mark("completion.enqueued")
    }

    private func stopWorkoutSession(_ session: HKWorkoutSession, at date: Date) async -> WorkoutStopResult {
        if session.state == .stopped {
            return WorkoutStopResult(date: session.endDate ?? date, confirmed: true)
        }
        return await withCheckedContinuation { continuation in
            stoppedContinuation = continuation
            stopTimeoutTask?.cancel()
            stopTimeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(5))
                guard let self, !Task.isCancelled else { return }
                workoutLog.error("timeout aguardando HKWorkoutSession.stopped")
                WatchLaunchDiagnostics.mark("workout.stop-timeout")
                self.resolveStoppedContinuation(with: date, confirmed: false)
            }
            session.stopActivity(with: date)
        }
    }

    private func resolveStoppedContinuation(with date: Date, confirmed: Bool) {
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        let continuation = stoppedContinuation
        stoppedContinuation = nil
        continuation?.resume(returning: WorkoutStopResult(date: date, confirmed: confirmed))
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
        updateLocationAuthorizationState(locationManager)
        let status = locationManager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            workoutLog.info("GPS aguardando autorização (status=\(status.rawValue, privacy: .public))")
            return
        }
        locationManager.startUpdatingLocation()
        workoutLog.info("GPS iniciado")
        #endif
    }

    private func saveWorkoutWithDeadline(
        _ builder: HKLiveWorkoutBuilder,
        at date: Date
    ) async throws -> HKWorkout {
        let gate = WorkoutSaveDeadlineGate()
        return try await withCheckedThrowingContinuation { continuation in
            gate.install(continuation)
            Task { @MainActor in
                do {
                    WatchLaunchDiagnostics.mark("builder.end-collection")
                    try await builder.endCollection(at: date)
                    WatchLaunchDiagnostics.mark("builder.finish-workout")
                    guard let workout = try await builder.finishWorkout() else {
                        throw WorkoutFinalizationError.workoutNotSaved
                    }
                    _ = gate.resolve(.success(workout))
                } catch {
                    _ = gate.resolve(.failure(error))
                }
            }
            Task { @MainActor in
                try? await Task.sleep(
                    nanoseconds: UInt64(
                        Self.healthKitSaveTimeoutSeconds * 1_000_000_000
                    )
                )
                if gate.resolve(.failure(WorkoutFinalizationError.healthKitSaveTimeout)) {
                    WatchLaunchDiagnostics.mark("builder.finish-timeout")
                }
            }
        }
    }

    private func finishRouteWithDeadline(
        _ routeBuilder: HKWorkoutRouteBuilder,
        workout: HKWorkout,
        metadata: [String: Any]
    ) async throws {
        let gate = RouteFinishDeadlineGate()
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in
            gate.install(continuation)
            Task { @MainActor in
                do {
                    _ = try await routeBuilder.finishRoute(
                        with: workout,
                        metadata: metadata
                    )
                    _ = gate.resolve(.success(()))
                } catch {
                    _ = gate.resolve(.failure(error))
                }
            }
            Task { @MainActor in
                try? await Task.sleep(
                    nanoseconds: UInt64(
                        Self.routeFinishTimeoutSeconds * 1_000_000_000
                    )
                )
                if gate.resolve(.failure(WorkoutFinalizationError.routeFinishTimeout)) {
                    WatchLaunchDiagnostics.mark("route.finish.timeout")
                }
            }
        }
    }

    private func updateLocationAuthorizationState(_ manager: CLLocationManager) {
        guard CLLocationManager.locationServicesEnabled() else {
            liveRouteLocationState = .unavailable
            return
        }

        switch manager.authorizationStatus {
        case .notDetermined:
            liveRouteLocationState = .seeking
        case .denied, .restricted:
            liveRouteLocationState = .denied
        case .authorizedAlways, .authorizedWhenInUse:
            if metrics.isPaused {
                liveRouteLocationState = .paused(
                    horizontalAccuracy: lastLocationAccuracy,
                    lastUpdatedAt: lastLocationUpdatedAt
                )
            } else if manager.accuracyAuthorization == .reducedAccuracy {
                liveRouteLocationState = .reducedAccuracy(
                    horizontalAccuracy: lastLocationAccuracy,
                    lastUpdatedAt: lastLocationUpdatedAt
                )
            } else if let accuracy = lastLocationAccuracy,
                      let updatedAt = lastLocationUpdatedAt {
                liveRouteLocationState = accuracy <= Self.acceptedLocationAccuracyMeters
                    ? .active(horizontalAccuracy: accuracy, lastUpdatedAt: updatedAt)
                    : .reducedAccuracy(
                        horizontalAccuracy: accuracy,
                        lastUpdatedAt: updatedAt
                    )
            } else {
                liveRouteLocationState = .seeking
            }
        @unknown default:
            liveRouteLocationState = .unavailable
        }
    }

    private func updateLiveRouteLocation(
        manager: CLLocationManager,
        location: CLLocation
    ) {
        guard location.horizontalAccuracy >= 0 else { return }
        lastLocationAccuracy = location.horizontalAccuracy
        lastLocationUpdatedAt = location.timestamp
        if manager.accuracyAuthorization == .reducedAccuracy
            || location.horizontalAccuracy > Self.acceptedLocationAccuracyMeters {
            liveRouteLocationState = .reducedAccuracy(
                horizontalAccuracy: location.horizontalAccuracy,
                lastUpdatedAt: location.timestamp
            )
        } else {
            liveRouteLocationState = .active(
                horizontalAccuracy: location.horizontalAccuracy,
                lastUpdatedAt: location.timestamp
            )
        }
    }

    private func refreshLocationFreshness(now: Date = Date()) {
        guard phase == .running, !metrics.isPaused, wantsLocationUpdates else { return }
        guard let lastLocationUpdatedAt else {
            liveRouteLocationState = .seeking
            return
        }
        if now.timeIntervalSince(lastLocationUpdatedAt) > Self.locationFreshnessSeconds {
            liveRouteLocationState = .seeking
        }
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
        coachController.begin(
            enabled: isCoachEnabledForCurrentWorkout,
            audioOwner: coachConfiguration.audioOwner,
            policy: coachConfiguration.policy,
            initialMuted: coachConfiguration.isMuted,
            distanceMeters: metrics.distanceMeters,
            elapsedSeconds: metrics.elapsedSeconds
        )
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
        appendLiveRoutePoints([point])
        lastLocationAccuracy = point.accuracy
        lastLocationUpdatedAt = Date(timeIntervalSince1970: point.timestamp / 1000)
        liveRouteLocationState = .active(
            horizontalAccuracy: point.accuracy ?? 5,
            lastUpdatedAt: lastLocationUpdatedAt ?? Date()
        )
        coachController.update(
            distanceMeters: metrics.distanceMeters,
            elapsedSeconds: metrics.elapsedSeconds,
            isPaused: metrics.isPaused
        )
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
            if toState == .paused {
                wantsLocationUpdates = false
                locationManager.stopUpdatingLocation()
                beginNewLiveRouteSegmentAfterPause()
                coachController.pause()
                WatchLaunchDiagnostics.mark("workout.paused")
            } else if toState == .running, phase == .running {
                locationCutoffDate = date
                wantsLocationUpdates = true
                updateLocationAuthorizationState(locationManager)
                startLocationUpdatesIfAuthorized()
                WatchLaunchDiagnostics.mark(fromState == .paused ? "workout.resumed" : "workout.session-running")
            } else if toState == .stopped {
                wantsLocationUpdates = false
                locationManager.stopUpdatingLocation()
                WatchLaunchDiagnostics.mark("workout.stopped")
                resolveStoppedContinuation(with: date, confirmed: true)
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
                resolveStoppedContinuation(with: Date(), confirmed: false)
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
            coachController.update(
                distanceMeters: metrics.distanceMeters,
                elapsedSeconds: metrics.elapsedSeconds,
                isPaused: metrics.isPaused
            )
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
            self.updateLocationAuthorizationState(manager)
            self.startLocationUpdatesIfAuthorized()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            guard self.phase == .running,
                  self.sessionState == .running,
                  !self.metrics.isPaused,
                  self.wantsLocationUpdates else { return }

            let cutoffTimestamp = max(
                self.locationCutoffDate.timeIntervalSince1970,
                (self.routePoints.last?.timestamp ?? 0) / 1000.0
            )
            if let newestLocation = locations
                .filter({
                    $0.horizontalAccuracy >= 0
                        && $0.timestamp.timeIntervalSince1970 >= cutoffTimestamp
                })
                .max(by: { $0.timestamp < $1.timestamp }) {
                self.updateLiveRouteLocation(
                    manager: manager,
                    location: newestLocation
                )
            }

            var newestTimestamp = cutoffTimestamp
            let filtered = locations
                .filter {
                    $0.horizontalAccuracy >= 0
                        && $0.horizontalAccuracy <= Self.acceptedLocationAccuracyMeters
                        && $0.timestamp.timeIntervalSince1970 >= newestTimestamp
                }
                .sorted { $0.timestamp < $1.timestamp }
                .filter { location in
                    let timestamp = location.timestamp.timeIntervalSince1970
                    guard timestamp > newestTimestamp else { return false }
                    newestTimestamp = timestamp
                    return true
                }
            guard !filtered.isEmpty else { return }

            let points = filtered.map { RoutePoint(from: $0) }
            self.routePoints.append(contentsOf: points)
            self.appendLiveRoutePoints(points)
            self.routeRecorder.enqueue(locations: filtered, points: points)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        workoutLog.error("GPS erro: \(error.localizedDescription, privacy: .public)")
        Task { @MainActor in
            guard let locationError = error as? CLError else {
                self.liveRouteLocationState = .unavailable
                return
            }
            switch locationError.code {
            case .denied:
                self.liveRouteLocationState = .denied
            case .locationUnknown:
                self.liveRouteLocationState = .seeking
            default:
                self.liveRouteLocationState = .unavailable
            }
        }
    }
}

private enum WorkoutFinalizationError: LocalizedError {
    case missingSession
    case missingBuilder
    case stopNotConfirmed
    case workoutNotSaved
    case healthKitSaveTimeout
    case routeFinishTimeout

    var errorDescription: String? {
        switch self {
        case .missingSession: return "Sessão de treino indisponível"
        case .missingBuilder: return "Workout builder indisponível"
        case .stopNotConfirmed: return "HealthKit não confirmou a interrupção da sessão"
        case .workoutNotSaved: return "HealthKit não retornou o workout salvo"
        case .healthKitSaveTimeout: return "HealthKit excedeu o tempo para salvar o workout"
        case .routeFinishTimeout: return "HealthKit excedeu o tempo para anexar a rota"
        }
    }
}

@MainActor
private final class WorkoutSaveDeadlineGate {
    private var continuation: CheckedContinuation<HKWorkout, Error>?

    func install(_ continuation: CheckedContinuation<HKWorkout, Error>) {
        self.continuation = continuation
    }

    @discardableResult
    func resolve(_ result: Result<HKWorkout, Error>) -> Bool {
        guard let continuation else { return false }
        self.continuation = nil
        continuation.resume(with: result)
        return true
    }
}

@MainActor
private final class RouteFinishDeadlineGate {
    private var continuation: CheckedContinuation<Void, Error>?

    func install(_ continuation: CheckedContinuation<Void, Error>) {
        self.continuation = continuation
    }

    @discardableResult
    func resolve(_ result: Result<Void, Error>) -> Bool {
        guard let continuation else { return false }
        self.continuation = nil
        continuation.resume(with: result)
        return true
    }
}

private struct WorkoutStopResult {
    let date: Date
    let confirmed: Bool
}

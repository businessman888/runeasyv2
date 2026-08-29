import Foundation
import WatchConnectivity
import Combine
import os

private let bridgeLog = Logger(
    subsystem: "com.oytotec.runeasy.watchkitapp",
    category: "bridge"
)

enum WatchSyncState: Equatable {
    case waiting
    case synced
    case stale
    case incompatible
    case signedOut
}

struct RunDeliveryAck: Codable, Equatable {
    enum Status: String, Codable {
        case serverAccepted = "server_accepted"
        case pendingSync = "pending_sync"
    }

    let runId: String
    let status: Status
    let acknowledgedAt: String
}

/// Bridge WatchConnectivity entre o Apple Watch e o iPhone.
/// - iPhone → Watch: `applicationContext` com contexto unificado (user, workout, stats, next)
/// - Watch → iPhone: `transferUserInfo` com a corrida finalizada (durável, retry automático)
@MainActor
final class PhoneBridge: NSObject, ObservableObject {

    // MARK: - Published (consumidos pelas Views)

    @Published var todayWorkout: PlannedWorkout?
    @Published var userName: String = "Atleta"
    @Published var avatarUrl: String?
    @Published var weekStats: WeekStats = .zero
    @Published var nextWorkout: NextWorkoutInfo?
    /// Tier do usuário. Sinal de RENDERIZAÇÃO: decide entre UpgradeProCard e
    /// RestDayCard, que antes eram indistinguíveis (ambos vinham como
    /// `today_rest`). O filtro de dados continua no iPhone.
    @Published var isPro: Bool = true
    @Published var todayActivities: [ActivityForWatch] = []
    @Published var latestPlanResult: RunResultForWatch?
    @Published var latestActivityResult: RunResultForWatch?
    @Published var isReachable: Bool = false
    @Published var pendingTransfers: Int = 0
    @Published var lastSentAt: Date?
    @Published var lastError: String?
    /// Já recebemos ao menos um contexto do iPhone? Distingue "sem treino hoje"
    /// de "nunca sincronizou" na UI.
    @Published var hasReceivedContext: Bool = false
    @Published var lastContextAt: Date?
    @Published var syncState: WatchSyncState = .waiting
    @Published var lastRunAck: RunDeliveryAck?

    private let session: WCSession?
    private var accountId: String?
    private var contextExpiryTask: Task<Void, Never>?
    private var lastAcceptedContextId: String?
    private var lastAcceptedSentAt: Date?
    private var completedWorkoutIds: Set<String>
    private var completedWorkoutOrder: [String]
    private static let supportedSchemaVersion = 2
    private static let contextTTL: TimeInterval = 36 * 60 * 60
    private static let subscriptionTTL: TimeInterval = 24 * 60 * 60
    private static let contextIdDefaultsKey = "RunEasy.lastAcceptedContextId"
    private static let contextDateDefaultsKey = "RunEasy.lastAcceptedContextDate"
    private static let completedWorkoutDefaultsKey = "RunEasy.completedWorkoutIds"

    override init() {
        let defaults = UserDefaults.standard
        self.lastAcceptedContextId = defaults.string(
            forKey: Self.contextIdDefaultsKey
        )
        let acceptedTimestamp = defaults.double(
            forKey: Self.contextDateDefaultsKey
        )
        self.lastAcceptedSentAt = acceptedTimestamp > 0
            ? Date(timeIntervalSince1970: acceptedTimestamp)
            : nil
        let storedCompletedWorkoutIds =
            defaults.stringArray(forKey: Self.completedWorkoutDefaultsKey) ?? []
        self.completedWorkoutIds = Set(storedCompletedWorkoutIds)
        self.completedWorkoutOrder = storedCompletedWorkoutIds
        if WCSession.isSupported() {
            self.session = WCSession.default
        } else {
            self.session = nil
        }
        super.init()
        // Activation adiada — chamar activate() depois da scene SwiftUI estar pronta,
        // via .task no ContentView. Em watchOS 26 ativar no init() corre com a inicialização
        // de scene e pode causar crash em NavigationStack push subsequente.
    }

    /// Deve ser chamado uma vez depois que a scene SwiftUI estiver pronta (.task em ContentView).
    func activate() {
        guard let session, session.activationState != .activated else { return }
        session.delegate = self
        session.activate()
    }

    // MARK: - Send (Watch → iPhone)

    /// Envia o `CompletedRun` ao iPhone com persistência (retry automático até entrega).
    @discardableResult
    func sendCompletedRun(_ run: CompletedRun) -> Bool {
        guard let session, session.activationState == .activated else {
            lastError = "Sessão WatchConnectivity inativa"
            return false
        }
        do {
            let data = try JSONEncoder().encode(run)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                lastError = "Falha ao serializar payload"
                return false
            }
            let envelope: [String: Any] = [
                "type": "completed_run",
                "payload": dict,
                "sent_at": ISO8601DateFormatter().string(from: Date())
            ]
            session.transferUserInfo(envelope)
            pendingTransfers = session.outstandingUserInfoTransfers.count
            lastSentAt = Date()
            lastError = nil
            return true
        } catch {
            lastError = "Erro ao serializar: \(error.localizedDescription)"
            return false
        }
    }

    // MARK: - Requests (Watch → iPhone, sob demanda)

    /// Pede ao iPhone o contexto atualizado.
    ///
    /// `sendMessage` só entrega com o app do iPhone EM EXECUÇÃO. Diferente de
    /// `transferUserInfo`, não há fila nem retry — por isso todo call site
    /// precisa lidar com `false` (não entregue) em vez de assumir sucesso.
    @discardableResult
    func requestRefresh() -> Bool {
        sendRequest(type: "request_refresh")
    }

    /// Pede ao iPhone para abrir o fluxo de upgrade (o Superwall não roda no
    /// watchOS, então o paywall só existe do outro lado).
    @discardableResult
    func requestOpenPaywall() -> Bool {
        sendRequest(type: "open_paywall")
    }

    private func sendRequest(type: String) -> Bool {
        guard let session, session.activationState == .activated, session.isReachable else {
            bridgeLog.info("request \(type, privacy: .public) abortado — iPhone não alcançável")
            return false
        }
        session.sendMessage(
            ["type": type],
            replyHandler: { _ in
                bridgeLog.info("request \(type, privacy: .public) confirmado pelo iPhone")
            },
            errorHandler: { error in
                bridgeLog.error(
                    "request \(type, privacy: .public) falhou: \(error.localizedDescription, privacy: .public)"
                )
            }
        )
        return true
    }

    // MARK: - Receive (iPhone → Watch)

    private func handleReceived(_ context: [String: Any]) {
        guard !context.isEmpty else { return }
        guard let sentAt = validate(context: context) else { return }

        if context["auth_state"] as? String == "signed_out" {
            clearUserContext()
            syncState = .signedOut
            lastContextAt = sentAt
            rememberAcceptedContext(context, sentAt: sentAt)
            return
        }

        guard let incomingAccountId = context["account_id"] as? String,
              !incomingAccountId.isEmpty else {
            invalidateContext(as: .incompatible, reason: "contexto sem identidade de conta")
            return
        }
        if let accountId, accountId != incomingAccountId {
            clearUserContext()
        }
        accountId = incomingAccountId

        let type = context["type"] as? String

        // Treino do dia (ou rest)
        if type == "today_workout" {
            handleTodayWorkout(context["payload"])
        } else if type == "today_rest" {
            todayWorkout = nil
        }

        // Sempre tenta atualizar campos auxiliares (eles vêm em todos os contextos)
        if let name = context["user_name"] as? String, !name.isEmpty {
            userName = name
        }
        if let url = context["avatar_url"] as? String, !url.isEmpty {
            avatarUrl = url
        } else if context.keys.contains("avatar_url") {
            // explicit null → limpa
            avatarUrl = nil
        }
        if let pro = context["is_pro"] as? Bool {
            isPro = pro
        }
        if let statsDict = context["week_stats"] as? [String: Any] {
            weekStats = decode(WeekStats.self, from: statsDict, label: "week_stats") ?? weekStats
        }
        if let nextDict = context["next_workout"] as? [String: Any] {
            nextWorkout = decode(NextWorkoutInfo.self, from: nextDict, label: "next_workout")
        } else if context.keys.contains("next_workout") {
            nextWorkout = nil
        }
        if let activities = context["today_activities"] as? [[String: Any]] {
            todayActivities = activities.compactMap {
                decode(ActivityForWatch.self, from: $0, label: "activity")
            }
        } else if context.keys.contains("today_activities") {
            todayActivities = []
        }
        if let planDict = context["latest_plan_result"] as? [String: Any] {
            latestPlanResult = decode(RunResultForWatch.self, from: planDict, label: "latest_plan_result")
        } else if context.keys.contains("latest_plan_result") {
            latestPlanResult = nil
        }
        if let actDict = context["latest_activity_result"] as? [String: Any] {
            latestActivityResult = decode(RunResultForWatch.self, from: actDict, label: "latest_activity_result")
        } else if context.keys.contains("latest_activity_result") {
            latestActivityResult = nil
        }
        if let ackDict = context["run_ack"] as? [String: Any] {
            lastRunAck = decode(RunDeliveryAck.self, from: ackDict, label: "run_ack")
        } else if context.keys.contains("run_ack") {
            lastRunAck = nil
        }

        hasReceivedContext = true
        lastContextAt = sentAt
        syncState = .synced
        rememberAcceptedContext(context, sentAt: sentAt)
        scheduleExpiry(for: sentAt)
        bridgeLog.info(
            "contexto recebido: pro=\(self.isPro, privacy: .public) workout=\(self.todayWorkout != nil, privacy: .public) atividades=\(self.todayActivities.count, privacy: .public)"
        )
    }

    private func validate(context: [String: Any]) -> Date? {
        guard let schema = context["schema_version"] as? Int,
              schema == Self.supportedSchemaVersion else {
            rejectIncoming(as: .incompatible, reason: "schema incompatível")
            return nil
        }
        guard let contextId = context["context_id"] as? String,
              !contextId.isEmpty else {
            rejectIncoming(as: .incompatible, reason: "context_id inválido")
            return nil
        }
        if contextId == lastAcceptedContextId, hasReceivedContext {
            bridgeLog.info("contexto duplicado ignorado: \(contextId, privacy: .public)")
            return nil
        }
        guard let sentAtRaw = context["sent_at"] as? String,
              let sentAt = parseISO8601(sentAtRaw) else {
            rejectIncoming(as: .incompatible, reason: "sent_at inválido")
            return nil
        }
        if let lastAcceptedSentAt,
           sentAt <= lastAcceptedSentAt,
           hasReceivedContext {
            bridgeLog.info("contexto fora de ordem ignorado: \(contextId, privacy: .public)")
            return nil
        }
        let age = Date().timeIntervalSince(sentAt)
        guard age >= -300, age <= Self.contextTTL else {
            rejectIncoming(as: .stale, reason: "contexto expirado")
            return nil
        }
        if context["auth_state"] as? String == "signed_in" {
            guard let verifiedRaw = context["subscription_verified_at"] as? String,
                  let verifiedAt = parseISO8601(verifiedRaw) else {
                rejectIncoming(as: .incompatible, reason: "entitlement sem verificação")
                return nil
            }
            let subscriptionAge = Date().timeIntervalSince(verifiedAt)
            guard subscriptionAge >= -300,
                  subscriptionAge <= Self.subscriptionTTL else {
                rejectIncoming(as: .stale, reason: "entitlement expirado")
                return nil
            }
        }
        return sentAt
    }

    private func parseISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func invalidateContext(as state: WatchSyncState, reason: String) {
        clearUserContext()
        syncState = state
        bridgeLog.error("contexto rejeitado: \(reason, privacy: .public)")
    }

    /// A corrida planejada já terminou neste relógio, mesmo que o iPhone ainda
    /// esteja offline. Bloqueamos o card localmente no momento do enqueue para
    /// impedir uma segunda execução durante a janela de entrega eventual.
    func markWorkoutCompletionPending(_ workoutId: String?) {
        guard let workoutId else { return }
        rememberCompletedWorkout(workoutId)
        if var workout = todayWorkout, workout.id == workoutId {
            workout.status = .completed
            todayWorkout = workout
        }
    }

    private func rejectIncoming(as state: WatchSyncState, reason: String) {
        if !hasReceivedContext {
            syncState = state
        }
        bridgeLog.error("contexto recebido foi ignorado: \(reason, privacy: .public)")
    }

    private func rememberAcceptedContext(
        _ context: [String: Any],
        sentAt: Date
    ) {
        guard let contextId = context["context_id"] as? String else { return }
        lastAcceptedContextId = contextId
        lastAcceptedSentAt = sentAt
        let defaults = UserDefaults.standard
        defaults.set(contextId, forKey: Self.contextIdDefaultsKey)
        defaults.set(
            sentAt.timeIntervalSince1970,
            forKey: Self.contextDateDefaultsKey
        )
    }

    private func clearUserContext() {
        contextExpiryTask?.cancel()
        contextExpiryTask = nil
        todayWorkout = nil
        userName = "Atleta"
        avatarUrl = nil
        weekStats = .zero
        nextWorkout = nil
        todayActivities = []
        latestPlanResult = nil
        latestActivityResult = nil
        lastRunAck = nil
        isPro = true
        hasReceivedContext = false
        accountId = nil
    }

    private func scheduleExpiry(for sentAt: Date) {
        contextExpiryTask?.cancel()
        let remaining = max(
            1,
            Self.contextTTL - Date().timeIntervalSince(sentAt)
        )
        contextExpiryTask = Task { @MainActor [weak self] in
            try? await Task.sleep(
                nanoseconds: UInt64(remaining * 1_000_000_000)
            )
            guard let self, !Task.isCancelled,
                  self.lastContextAt == sentAt,
                  self.hasReceivedContext else { return }
            self.invalidateContext(as: .stale, reason: "contexto expirou durante o uso")
        }
    }

    private func handleTodayWorkout(_ rawPayload: Any?) {
        guard let dict = rawPayload as? [String: Any] else {
            todayWorkout = nil
            return
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: dict)
            var workout = try JSONDecoder().decode(PlannedWorkout.self, from: data)
            if workout.isCompleted {
                rememberCompletedWorkout(workout.id)
            } else if completedWorkoutIds.contains(workout.id) {
                // Completion is terminal for a workout identity. A delayed
                // context must never re-enable its start button.
                workout.status = .completed
            }
            todayWorkout = workout
        } catch {
            print("[PhoneBridge] falha ao decodificar treino:", error)
        }
    }

    private func rememberCompletedWorkout(_ workoutId: String) {
        completedWorkoutIds.insert(workoutId)
        completedWorkoutOrder.removeAll { $0 == workoutId }
        completedWorkoutOrder.append(workoutId)
        // Bound persistent storage while retaining far more history than the
        // Watch UI can ever expose at once.
        completedWorkoutOrder = Array(completedWorkoutOrder.suffix(64))
        completedWorkoutIds = Set(completedWorkoutOrder)
        UserDefaults.standard.set(
            completedWorkoutOrder,
            forKey: Self.completedWorkoutDefaultsKey
        )
    }

    /// Decode genérico com log de erro explícito.
    ///
    /// Antes cada campo tinha seu próprio decoder e o call site fazia
    /// `decode(...) ?? valorAntigo`, o que tornava uma falha completamente
    /// invisível — foi assim que o mismatch de CodingKeys do WeekStats passou
    /// meses zerando os pills do header sem ninguém notar.
    private func decode<T: Decodable>(
        _ type: T.Type,
        from dict: [String: Any],
        label: String
    ) -> T? {
        do {
            let data = try JSONSerialization.data(withJSONObject: dict)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            bridgeLog.error(
                "falha ao decodificar \(label, privacy: .public): \(String(describing: error), privacy: .public)"
            )
            return nil
        }
    }
}

// MARK: - WCSessionDelegate

extension PhoneBridge: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            if activationState == .activated {
                self.handleReceived(session.receivedApplicationContext)
            }
            if let error {
                self.lastError = "Activation falhou: \(error.localizedDescription)"
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        Task { @MainActor in
            self.handleReceived(applicationContext)
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        Task { @MainActor in
            self.handleReceived(message)
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
        }
    }

    nonisolated func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        Task { @MainActor in
            if let error {
                self.lastError = "Transfer falhou: \(error.localizedDescription)"
            }
            self.pendingTransfers = session.outstandingUserInfoTransfers.count
        }
    }
}

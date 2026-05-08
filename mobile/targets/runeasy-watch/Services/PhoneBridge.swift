import Foundation
import WatchConnectivity
import Combine

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
    @Published var isReachable: Bool = false
    @Published var pendingTransfers: Int = 0
    @Published var lastSentAt: Date?
    @Published var lastError: String?

    private let session: WCSession?

    override init() {
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
    func sendCompletedRun(_ run: CompletedRun) {
        guard let session, session.activationState == .activated else {
            lastError = "Sessão WatchConnectivity inativa"
            return
        }
        do {
            let data = try JSONEncoder().encode(run)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                lastError = "Falha ao serializar payload"
                return
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
        } catch {
            lastError = "Erro ao serializar: \(error.localizedDescription)"
        }
    }

    // MARK: - Receive (iPhone → Watch)

    private func handleReceived(_ context: [String: Any]) {
        guard !context.isEmpty else { return }
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
        if let statsDict = context["week_stats"] as? [String: Any] {
            weekStats = decodeWeekStats(statsDict) ?? weekStats
        }
        if let nextDict = context["next_workout"] as? [String: Any] {
            nextWorkout = decodeNextWorkout(nextDict)
        } else if context.keys.contains("next_workout") {
            nextWorkout = nil
        }
    }

    private func handleTodayWorkout(_ rawPayload: Any?) {
        guard let dict = rawPayload as? [String: Any] else {
            todayWorkout = nil
            return
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: dict)
            let workout = try JSONDecoder().decode(PlannedWorkout.self, from: data)
            todayWorkout = workout
        } catch {
            print("[PhoneBridge] falha ao decodificar treino:", error)
        }
    }

    private func decodeWeekStats(_ dict: [String: Any]) -> WeekStats? {
        do {
            let data = try JSONSerialization.data(withJSONObject: dict)
            return try JSONDecoder().decode(WeekStats.self, from: data)
        } catch {
            print("[PhoneBridge] falha ao decodificar week_stats:", error)
            return nil
        }
    }

    private func decodeNextWorkout(_ dict: [String: Any]) -> NextWorkoutInfo? {
        do {
            let data = try JSONSerialization.data(withJSONObject: dict)
            return try JSONDecoder().decode(NextWorkoutInfo.self, from: data)
        } catch {
            print("[PhoneBridge] falha ao decodificar next_workout:", error)
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

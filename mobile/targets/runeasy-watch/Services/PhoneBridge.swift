import Foundation
import WatchConnectivity
import Combine

/// Bridge WatchConnectivity entre o Apple Watch e o iPhone.
/// - iPhone → Watch: `applicationContext` com o treino do dia (sempre disponível, último valor)
/// - Watch → iPhone: `transferUserInfo` com a corrida finalizada (durável, retry automático)
@MainActor
final class PhoneBridge: NSObject, ObservableObject {

    // MARK: - Published (consumidos pelas Views)

    @Published var todayWorkout: PlannedWorkout?
    @Published var userName: String = "Atleta"
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
            // Adiciona um envelope com tipo da mensagem pra o iPhone rotear
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
    // Tratado nos delegates. Roteamos por `type` no envelope.

    private func handleReceived(_ context: [String: Any]) {
        guard let type = context["type"] as? String else { return }
        switch type {
        case "today_workout":
            handleTodayWorkout(context["payload"])
            if let name = context["user_name"] as? String { userName = name }
        case "today_rest":
            todayWorkout = nil
            if let name = context["user_name"] as? String { userName = name }
        case "user_info":
            if let name = context["user_name"] as? String { userName = name }
        default:
            break
        }
    }

    private func handleTodayWorkout(_ rawPayload: Any?) {
        guard let dict = rawPayload as? [String: Any] else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: dict)
            let workout = try JSONDecoder().decode(PlannedWorkout.self, from: data)
            todayWorkout = workout
        } catch {
            print("[PhoneBridge] falha ao decodificar treino:", error)
        }
    }
}

// MARK: - WCSessionDelegate

extension PhoneBridge: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            if activationState == .activated {
                // Aplica último context recebido (estado durável)
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
        // Reservado para mensagens em tempo real (não usado em V1)
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

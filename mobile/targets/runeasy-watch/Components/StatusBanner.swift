import SwiftUI

enum RunStatus {
    case running
    case paused

    var color: Color {
        switch self {
        case .running: return .runEasyCyan
        case .paused:  return .runEasyWarning
        }
    }

    var label: String {
        switch self {
        case .running: return "TREINANDO"
        case .paused:  return "PAUSADO"
        }
    }

    var icon: String {
        switch self {
        case .running: return "bolt.fill"
        case .paused:  return "pause.fill"
        }
    }
}

// Banner inspirado na status bar da RunningScreen do iPhone
// (cyan quando treinando, amarelo quando pausado).
struct StatusBanner: View {
    let status: RunStatus

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: status.icon)
                .font(.system(size: 9, weight: .bold))
            Text(status.label)
                .font(AppFont.labelSmall)
                .tracking(0.5)
        }
        .foregroundColor(.runEasyNavy)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(status.color)
        .cornerRadius(8)
    }
}

/// Aviso de conectividade na tela inicial.
///
/// O PhoneBridge sempre publicou `isReachable` / `pendingTransfers` / `lastError`,
/// mas nenhuma view consumia — o usuário não tinha como saber que os dados
/// estavam velhos ou que uma corrida ainda não subiu (AUDITORIA §D5).
///
/// Só aparece quando há algo a dizer: em estado normal, nada é renderizado.
struct ConnectivityBanner: View {
    let isReachable: Bool
    let hasReceivedContext: Bool
    let pendingTransfers: Int
    /// Retorna false quando o pedido não pôde ser entregue.
    let onRefresh: () -> Bool

    @State private var isRefreshing = false

    private var message: String? {
        if pendingTransfers > 0 {
            return "Corrida pendente de envio ao iPhone"
        }
        if !hasReceivedContext {
            return "Aguardando dados do iPhone"
        }
        if !isReachable {
            return "iPhone fora de alcance — dados podem estar desatualizados"
        }
        return nil
    }

    var body: some View {
        if let message {
            Button {
                guard onRefresh() else { return }
                isRefreshing = true
                // Auto-reset: o pedido é fire-and-forget (sendMessage não tem
                // callback de "contexto aplicado"). Sem isto o rótulo ficava
                // preso em "Atualizando…" no caso mais comum — corrida pendente
                // COM o iPhone alcançável, onde isReachable nunca muda.
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 2_500_000_000)
                    isRefreshing = false
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: pendingTransfers > 0
                          ? "arrow.triangle.2.circlepath"
                          : "iphone.slash")
                        .font(.system(size: 9, weight: .semibold))
                    Text(isRefreshing ? "Atualizando…" : message)
                        .font(.system(size: 8, weight: .medium))
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                }
                .foregroundColor(.runEasyWarning)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.runEasyWarning.opacity(0.12))
                .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
    }
}

#Preview("Status de corrida") {
    VStack(spacing: 8) {
        StatusBanner(status: .running)
        StatusBanner(status: .paused)
    }
    .padding()
    .background(Color.runEasyNavy)
}

#Preview("Conectividade") {
    VStack(spacing: 8) {
        ConnectivityBanner(isReachable: false, hasReceivedContext: true, pendingTransfers: 0, onRefresh: { false })
        ConnectivityBanner(isReachable: true, hasReceivedContext: true, pendingTransfers: 1, onRefresh: { true })
        ConnectivityBanner(isReachable: true, hasReceivedContext: false, pendingTransfers: 0, onRefresh: { true })
    }
    .padding()
    .background(Color.runEasyNavy)
}

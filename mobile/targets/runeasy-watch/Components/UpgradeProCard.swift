import SwiftUI

/// Card de upgrade para Pro — o que o usuário Free deve ver no lugar do treino.
///
/// Corrige AUDITORIA §P1: antes o Free recebia `today_rest` e caía no
/// RestDayCard, indistinguível de um Pro em dia de descanso.
///
/// Desenho conforme o Figma: barra de gradiente ciano→azul na lateral esquerda,
/// escudo com coroa centralizado e headline em duas linhas centralizada.
/// O `ProTeaseBadge variant="shield"` do app mobile é o mesmo escudo — aqui ele
/// é composto com SF Symbols (shield.fill + crown.fill) em vez de asset, para
/// escalar nítido em qualquer tamanho de caixa.
///
/// O Superwall não roda no watchOS, então o CTA delega ao iPhone via
/// `sendMessage`. Quando o iPhone não está alcançável (app fechado), o card
/// degrada para uma instrução explícita em vez de falhar em silêncio.
struct UpgradeProCard: View {
    let isReachable: Bool
    /// Retorna false quando a mensagem não pôde ser entregue.
    let onUpgrade: () -> Bool

    @State private var showUnreachableHint = false

    /// Azul do fim do gradiente (a barra lateral e o escudo vão de ciano a azul).
    private static let gradientEnd = Color(hex: 0x3B3FD8)

    var body: some View {
        VStack(spacing: 8) {
            shieldBadge
            headline
            cta
            if showUnreachableHint || !isReachable {
                Text("Abra o RunEasy no iPhone para continuar.")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.runEasyWarning)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(Color.runEasyCardBg)
        // Barra de acento na lateral esquerda, clipada junto com o card.
        .overlay(alignment: .leading) {
            LinearGradient(
                colors: [.runEasyCyan, Self.gradientEnd],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .neonGlow(color: .runEasyCyan, radius: 6, opacity: 0.18)
    }

    // MARK: - Escudo com coroa

    private var shieldBadge: some View {
        ZStack {
            Image(systemName: "shield.fill")
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.runEasyCyan, Self.gradientEnd],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            Image(systemName: "crown.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .offset(y: -1)
        }
        .neonGlow(color: .runEasyCyan, radius: 8, opacity: 0.35)
    }

    // MARK: - Headline

    private var headline: some View {
        // Copy canônico do app mobile (HomeScreen: "Você está usando só uma
        // fração do RunEasy."). Mantido idêntico para as duas superfícies
        // falarem a mesma língua.
        Text("Você está\nusando só uma fração do RunEasy")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(.runEasyTextPrimary)
            .multilineTextAlignment(.center)
            .lineSpacing(1)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - CTA

    private var cta: some View {
        PrimaryActionButton(
            "Descobrir o que falta",
            tint: .runEasyCyan,
            foreground: .runEasyNavy
        ) {
            let delivered = onUpgrade()
            if !delivered {
                withAnimation { showUnreachableHint = true }
            }
        }
        .padding(.top, 2)
    }
}

#Preview("iPhone alcançável") {
    UpgradeProCard(isReachable: true, onUpgrade: { true })
        .padding(8)
        .background(Color.runEasyNavy)
}

#Preview("iPhone fora de alcance") {
    UpgradeProCard(isReachable: false, onUpgrade: { false })
        .padding(8)
        .background(Color.runEasyNavy)
}

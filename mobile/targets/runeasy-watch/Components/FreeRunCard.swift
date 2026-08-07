import SwiftUI

/// Card de treino livre — espelha o "Treino Livre" do HomeFab do app mobile.
///
/// Aparece em TODOS os estados da StartView (dia de treino, descanso, Free),
/// porque corrida livre é gratuita em qualquer plano. Foi a ausência deste card
/// que deixava o RestDayCard como beco sem saída — ver AUDITORIA §P3.
///
/// Hierarquia visual: quando existe um treino do plano no dia, ele é a ação
/// principal (card com glow neon). Este card fica abaixo e deliberadamente mais
/// discreto — borda fina, sem glow — para não competir.
struct FreeRunCard: View {
    /// Quando true, reduz o peso visual (usado nos dias com treino do plano).
    var isSecondary: Bool = true
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            PrimaryActionButton(
                "Começar",
                icon: "play.fill",
                tint: .runEasyCyan,
                foreground: .runEasyNavy
            ) {
                onStart()
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyCardBg)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(
                    Color.runEasyCyan.opacity(isSecondary ? 0.45 : 1.0),
                    lineWidth: isSecondary ? 1.0 : 1.5
                )
        )
        .neonGlow(
            color: .runEasyCyan,
            radius: isSecondary ? 0 : 6,
            opacity: isSecondary ? 0 : 0.20
        )
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "figure.run")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.runEasyCyan)
            VStack(alignment: .leading, spacing: 1) {
                Text("Treino Livre")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.runEasyTextPrimary)
                Text("Corra sem meta definida")
                    .font(.system(size: 8, weight: .regular))
                    .foregroundColor(.runEasyText60)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
        }
    }
}

#Preview("Secundário") {
    FreeRunCard(onStart: {})
        .padding()
        .background(Color.runEasyNavy)
}

#Preview("Principal") {
    FreeRunCard(isSecondary: false, onStart: {})
        .padding()
        .background(Color.runEasyNavy)
}

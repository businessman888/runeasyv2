import SwiftUI

// Card padrão do RunEasy: bg dark, opcionalmente borda cyan + neon glow
// quando "ativo" (mirror do WorkoutCard do iPhone).
struct RunEasyCard<Content: View>: View {
    let isActive: Bool
    let glowColor: Color
    let content: Content

    init(
        isActive: Bool = false,
        glowColor: Color = .runEasyCyan,
        @ViewBuilder content: () -> Content
    ) {
        self.isActive = isActive
        self.glowColor = glowColor
        self.content = content()
    }

    var body: some View {
        content
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.runEasyCardBg)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(isActive ? glowColor : Color.clear, lineWidth: isActive ? 1.5 : 0)
            )
            .modifier(ConditionalGlow(active: isActive, color: glowColor))
    }
}

private struct ConditionalGlow: ViewModifier {
    let active: Bool
    let color: Color

    func body(content: Content) -> some View {
        if active {
            content.neonGlow(color: color, radius: 8, opacity: 0.30)
        } else {
            content
        }
    }
}

#Preview {
    VStack(spacing: 10) {
        RunEasyCard(isActive: true) {
            VStack(alignment: .leading, spacing: 4) {
                Text("RODAGEM").font(AppFont.labelSmall).foregroundColor(.runEasyCyan)
                Text("Rodagem Leve").font(AppFont.titleMedium).foregroundColor(.white)
            }
        }
        RunEasyCard {
            Text("Card sem glow").font(AppFont.body).foregroundColor(.runEasyText60)
        }
    }
    .padding()
    .background(Color.runEasyNavy)
}

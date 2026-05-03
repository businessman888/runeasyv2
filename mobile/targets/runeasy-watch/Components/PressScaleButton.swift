import SwiftUI
import WatchKit

// Botão com press feedback (scale 0.96) + haptic, replicando o feel
// dos botões neon do iPhone (HomeFab, FinishingOverlay).
struct PressScaleButton<Label: View>: View {
    let action: () -> Void
    let haptic: WKHapticType?
    let label: Label

    init(
        action: @escaping () -> Void,
        haptic: WKHapticType? = .click,
        @ViewBuilder label: () -> Label
    ) {
        self.action = action
        self.haptic = haptic
        self.label = label()
    }

    @State private var isPressed = false

    var body: some View {
        Button {
            if let haptic { WKInterfaceDevice.current().play(haptic) }
            action()
        } label: {
            label
        }
        .buttonStyle(PressScaleStyle())
    }
}

private struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// Convenience: botão primário cyan com glow neon
struct PrimaryActionButton: View {
    let title: String
    let icon: String?
    let tint: Color
    let foreground: Color
    let action: () -> Void

    init(
        _ title: String,
        icon: String? = nil,
        tint: Color = .runEasyCyan,
        foreground: Color = .runEasyNavy,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.tint = tint
        self.foreground = foreground
        self.action = action
    }

    var body: some View {
        PressScaleButton(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon).font(.system(size: 13, weight: .bold)) }
                Text(title).font(AppFont.titleMedium)
            }
            .foregroundColor(foreground)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(tint)
            .cornerRadius(12)
            .neonGlow(color: tint, radius: 10, opacity: 0.50)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    VStack(spacing: 10) {
        PrimaryActionButton("Iniciar", icon: "play.fill") {}
        PrimaryActionButton("Pausar", icon: "pause.fill", tint: .runEasyWarning) {}
        PrimaryActionButton("Finalizar", icon: "stop.fill", tint: .runEasyRed, foreground: .white) {}
    }
    .padding()
    .background(Color.runEasyNavy)
}

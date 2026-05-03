import SwiftUI

// Escala tipográfica adaptada do iPhone (Plus Jakarta Sans) para SF Pro Rounded no Watch.
// Mantém a personalidade "bold + rounded" do RunEasy mas com renderização nativa.
enum AppFont {
    // Hero metric (active run main numbers)
    static let metricHero  = Font.system(size: 42, weight: .semibold, design: .rounded)
    static let metricLarge = Font.system(size: 32, weight: .semibold, design: .rounded)
    static let metricMedium = Font.system(size: 22, weight: .semibold, design: .rounded)
    static let metricSmall = Font.system(size: 16, weight: .semibold, design: .rounded)

    // Titles
    static let titleLarge = Font.system(size: 18, weight: .bold, design: .default)
    static let titleMedium = Font.system(size: 15, weight: .semibold, design: .default)
    static let titleSmall = Font.system(size: 13, weight: .semibold, design: .default)

    // Body
    static let body = Font.system(size: 13, weight: .regular, design: .default)
    static let bodyMedium = Font.system(size: 13, weight: .medium, design: .default)

    // Labels (uppercase, small caps)
    static let labelMedium = Font.system(size: 10, weight: .semibold, design: .default)
    static let labelSmall = Font.system(size: 9, weight: .semibold, design: .default)

    // Captions
    static let caption = Font.system(size: 11, weight: .regular, design: .default)
    static let captionMuted = Font.system(size: 10, weight: .regular, design: .default)
}

// Helpers para applicar shadows neon (signature do RunEasy)
extension View {
    /// Glow neon cyan — usar em botões primários e cards ativos
    func neonGlow(color: Color = .runEasyCyan, radius: CGFloat = 12, opacity: Double = 0.45) -> some View {
        self.shadow(color: color.opacity(opacity), radius: radius, x: 0, y: 0)
    }
}

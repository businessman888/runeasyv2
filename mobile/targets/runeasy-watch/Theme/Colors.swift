import SwiftUI

// Tokens alinhados com runeasyv2/mobile/src/theme/index.ts (iPhone como fonte canônica).
// Watch app deve manter coerência visual com o iPhone.
extension Color {
    // Backgrounds
    static let runEasyNavy        = Color(hex: 0x0A0A18) // primary dark navy
    static let runEasyNavyAlt     = Color(hex: 0x0E0E1F) // alt bg
    static let runEasyCardBg      = Color(hex: 0x15152A) // card bg
    static let runEasyBorder      = Color(hex: 0x2A2A3E) // border / skeleton

    // Signature
    static let runEasyCyan        = Color(hex: 0x00D4FF) // primary cyan neon
    static let runEasyPurple      = Color(hex: 0x9747FF) // recovery / special
    static let runEasyOrange      = Color(hex: 0xF59E0B) // streak

    // Status
    static let runEasySuccess     = Color(hex: 0x32CD32) // intense green (goal complete)
    static let runEasyGreen       = Color(hex: 0x10B981) // primary green
    static let runEasyWarning     = Color(hex: 0xFFC400) // yellow (paused, warning)
    static let runEasyRed         = Color(hex: 0xEF4444) // error / stop

    // Text
    static let runEasyTextPrimary   = Color.white
    static let runEasyTextSecondary = Color(hex: 0xEBEBF5)
    static let runEasyTextMuted     = Color(hex: 0xA0A0B2)
    static let runEasyText60        = Color(hex: 0xEBEBF5).opacity(0.60)
    static let runEasyText40        = Color(hex: 0xEBEBF5).opacity(0.40)
    static let runEasyDivider       = Color(hex: 0xEBEBF5).opacity(0.10)
}

extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

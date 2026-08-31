import SwiftUI

/// Tokens de layout do RunEasy adaptados ao espaço e à ergonomia do Apple Watch.
/// Views novas devem reutilizar estes valores em vez de criar medidas locais.
enum RunEasySpacing {
    static let micro: CGFloat = 2
    static let compact: CGFloat = 4
    static let small: CGFloat = 6
    static let medium: CGFloat = 8
    static let large: CGFloat = 12
    static let extraLarge: CGFloat = 16
}

enum RunEasyRadius {
    static let compact: CGFloat = 8
    static let control: CGFloat = 10
    static let card: CGFloat = 12
}

enum RunEasyControlSize {
    /// Área mínima confortável para uma ação usada em movimento.
    static let minimumTouch: CGFloat = 44
    static let primary: CGFloat = 56
}


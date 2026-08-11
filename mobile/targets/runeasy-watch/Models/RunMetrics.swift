import Foundation

struct RunMetrics: Equatable {
    var elapsedSeconds: Int = 0
    var distanceMeters: Double = 0
    var currentPaceSecondsPerKm: Double = 0
    var avgPaceSecondsPerKm: Double = 0
    var heartRate: Int? = nil
    var maxHeartRate: Int = 0
    var calories: Int = 0
    var isPaused: Bool = false

    var distanceKm: Double { distanceMeters / 1000.0 }
}

enum MetricFormat {
    static func time(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%d:%02d", m, s)
    }

    /// Metros → km com 2 casas. Usado durante a corrida, onde a precisão
    /// importa e o número muda a cada segundo.
    static func distance(_ meters: Double) -> String {
        String(format: "%.2f", meters / 1000.0)
    }

    /// Km → km compacto ("6" ou "5.2"). Usado em cards de resumo, onde a
    /// segunda casa decimal só rouba espaço na tela do relógio.
    /// Evita o round-trip de multiplicar por 1000 só para `distance` dividir.
    static func km(_ km: Double) -> String {
        if km == km.rounded() { return String(format: "%.0f", km) }
        return String(format: "%.1f", km)
    }

    static func pace(_ secondsPerKm: Double) -> String {
        guard secondsPerKm.isFinite, secondsPerKm > 0 else { return "--:--" }
        let total = Int(secondsPerKm.rounded())
        let m = total / 60
        let s = total % 60
        return String(format: "%d:%02d", m, s)
    }
}

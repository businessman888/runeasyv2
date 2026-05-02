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

    static func distance(_ meters: Double) -> String {
        String(format: "%.2f", meters / 1000.0)
    }

    static func pace(_ secondsPerKm: Double) -> String {
        guard secondsPerKm.isFinite, secondsPerKm > 0 else { return "--:--" }
        let total = Int(secondsPerKm.rounded())
        let m = total / 60
        let s = total % 60
        return String(format: "%d:%02d", m, s)
    }
}

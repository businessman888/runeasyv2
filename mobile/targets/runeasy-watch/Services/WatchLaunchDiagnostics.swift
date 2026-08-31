import Foundation
import os

private let launchDiagnosticsLog = Logger(
    subsystem: "com.oytotec.runeasy.watchkitapp",
    category: "launch-diagnostics"
)

/// Identifica de forma verificável a implementação de tracking contida no IPA.
/// O inspetor procura este valor no executável watchOS, não apenas no Info.plist.
enum WatchBuildInfo {
    static let runtimeMarker = "RUNEASY_WATCH_EXPERIENCE_V6_20260830"

    static var versionLabel: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "RunEasy v\(version) (\(build))"
    }
}

/// Breadcrumbs pequenos e persistentes para que um encerramento em TestFlight
/// deixe um último checkpoint recuperável no próximo lançamento.
enum WatchLaunchDiagnostics {
    static let previousRiskKey = "runeasy.watch.launch.previous-risk"

    private static let lastCheckpointKey = "runeasy.watch.launch.last-checkpoint"
    private static let historyKey = "runeasy.watch.launch.history"
    private static let maxHistoryCount = 24
    private static let defaults = UserDefaults.standard

    /// Deve rodar no init do App, antes que ContentView/WorkoutManager possam
    /// gravar checkpoints da nova execução.
    static func capturePreviousSession() {
        if let previous = defaults.string(forKey: lastCheckpointKey),
           isRiskCheckpoint(previous) {
            defaults.set(previous, forKey: previousRiskKey)
        } else {
            defaults.removeObject(forKey: previousRiskKey)
        }
    }

    static func beginAppSession() {
        mark("app.ready")
    }

    static func mark(_ checkpoint: String) {
        let entry = "\(ISO8601DateFormatter().string(from: Date()))|\(WatchBuildInfo.versionLabel)|\(checkpoint)"
        defaults.set(checkpoint, forKey: lastCheckpointKey)

        var history = defaults.stringArray(forKey: historyKey) ?? []
        history.append(entry)
        if history.count > maxHistoryCount {
            history.removeFirst(history.count - maxHistoryCount)
        }
        defaults.set(history, forKey: historyKey)
        launchDiagnosticsLog.info("checkpoint=\(checkpoint, privacy: .public) marker=\(WatchBuildInfo.runtimeMarker, privacy: .public)")
    }

    /// A tela de tracking realmente apareceu; qualquer aviso antigo pode sumir.
    static func markTrackingVisible() {
        mark("tracking.appeared")
        defaults.removeObject(forKey: previousRiskKey)
    }

    private static func isRiskCheckpoint(_ checkpoint: String) -> Bool {
        checkpoint.hasPrefix("home.tap.")
            || checkpoint == "launch.scheduled"
            || checkpoint == "route.will-set"
            || checkpoint == "route.did-set"
            || checkpoint == "play.tap"
            || checkpoint == "workout.start-requested"
            || checkpoint == "health.availability.check"
            || checkpoint == "health.auth.status-check"
            || checkpoint == "health.auth.request-will-present"
            || checkpoint == "health.auth.authorization-check"
            || checkpoint == "session.create.begin"
            || checkpoint == "session.create.end"
            || checkpoint == "builder.configure.begin"
            || checkpoint == "session.start-activity"
            || checkpoint == "builder.begin-collection"
            || checkpoint == "workout.stop-requested"
            || checkpoint == "builder.end-collection"
            || checkpoint == "builder.finish-workout"
            || checkpoint == "route.drain.begin"
            || checkpoint == "route.finish.begin"
            || checkpoint == "recovery.callback"
            || checkpoint == "recovery.requested"
    }
}

import Foundation
import WatchKit

@MainActor
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    let workoutManager = WorkoutManager()

    func handleActiveWorkoutRecovery() {
        WatchLaunchDiagnostics.mark("recovery.callback")
        guard workoutManager.beginRecovery() else { return }
        Task { @MainActor [workoutManager] in
            await workoutManager.recoverActiveWorkout()
        }
    }
}

import SwiftUI
import WatchKit

@main
struct RunEasyWatchApp: App {
    @WKApplicationDelegateAdaptor private var appDelegate: WatchAppDelegate
    @StateObject private var phoneBridge = PhoneBridge()

    init() {
        WatchLaunchDiagnostics.capturePreviousSession()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(workoutManager: appDelegate.workoutManager)
                .environmentObject(phoneBridge)
        }
    }
}

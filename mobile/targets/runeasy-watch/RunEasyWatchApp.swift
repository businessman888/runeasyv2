import SwiftUI
import WatchKit

@main
struct RunEasyWatchApp: App {
    @WKApplicationDelegateAdaptor private var appDelegate: WatchAppDelegate
    @StateObject private var phoneBridge = PhoneBridge.shared

    init() {
        WatchLaunchDiagnostics.capturePreviousSession()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(workoutManager: appDelegate.workoutManager)
                .environmentObject(phoneBridge)
        }
        .backgroundTask(.watchConnectivity) {
            await phoneBridge.drainBackgroundConnectivity()
        }
    }
}

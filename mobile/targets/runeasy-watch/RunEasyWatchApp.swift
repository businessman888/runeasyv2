import SwiftUI

@main
struct RunEasyWatchApp: App {
    @StateObject private var phoneBridge = PhoneBridge()

    init() {
        WatchLaunchDiagnostics.capturePreviousSession()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(phoneBridge)
        }
    }
}

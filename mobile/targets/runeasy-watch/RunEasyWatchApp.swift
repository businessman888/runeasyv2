import SwiftUI

@main
struct RunEasyWatchApp: App {
    @StateObject private var phoneBridge = PhoneBridge()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(phoneBridge)
        }
    }
}

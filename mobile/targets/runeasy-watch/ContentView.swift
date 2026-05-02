import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("RunEasy")
                .font(.headline)
                .foregroundColor(Color(red: 0.0, green: 0.83, blue: 1.0))
            Text("Hello, Watch!")
                .font(.caption)
                .foregroundColor(.white.opacity(0.6))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.04, green: 0.07, blue: 0.12))
    }
}

#Preview {
    ContentView()
}

import SwiftUI

enum RunStatus {
    case running
    case paused

    var color: Color {
        switch self {
        case .running: return .runEasyCyan
        case .paused:  return .runEasyWarning
        }
    }

    var label: String {
        switch self {
        case .running: return "TREINANDO"
        case .paused:  return "PAUSADO"
        }
    }

    var icon: String {
        switch self {
        case .running: return "bolt.fill"
        case .paused:  return "pause.fill"
        }
    }
}

// Banner inspirado na status bar da RunningScreen do iPhone
// (cyan quando treinando, amarelo quando pausado).
struct StatusBanner: View {
    let status: RunStatus

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: status.icon)
                .font(.system(size: 9, weight: .bold))
            Text(status.label)
                .font(AppFont.labelSmall)
                .tracking(0.5)
        }
        .foregroundColor(.runEasyNavy)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(status.color)
        .cornerRadius(8)
    }
}

#Preview {
    VStack(spacing: 8) {
        StatusBanner(status: .running)
        StatusBanner(status: .paused)
    }
    .padding()
    .background(Color.runEasyNavy)
}

import SwiftUI

/// Header da StartView: avatar do usuário (canto esquerdo) + 3 pills de stats da semana.
/// Espelha o header da home do app mobile (Figma node 1060-1239).
///
/// Pills:
///   🔥 streak (sequência de dias de treino)
///   ⚡ workoutsDone / workoutsTotal (treinos da semana)
///   🏃 restDone / restTotal (descansos da semana)
struct HeaderView: View {
    let avatarUrl: String?
    let stats: WeekStats

    var body: some View {
        HStack(spacing: 4) {
            avatar
            Spacer(minLength: 2)
            statPill(icon: "flame.fill", value: "\(stats.streak)", iconColor: .runEasyOrange)
            statPill(
                icon: "bolt.fill",
                value: "\(stats.workoutsDone)/\(stats.workoutsTotal)",
                iconColor: .runEasyPurple
            )
            statPill(
                icon: "figure.run",
                value: "\(stats.restDone)/\(stats.restTotal)",
                iconColor: .runEasyCyan
            )
        }
        .padding(.horizontal, 2)
    }

    // MARK: - Avatar

    private var avatar: some View {
        Group {
            if let urlString = avatarUrl,
               !urlString.isEmpty,
               let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure:
                        avatarPlaceholder
                    case .empty:
                        avatarPlaceholder.opacity(0.6)
                    @unknown default:
                        avatarPlaceholder
                    }
                }
            } else {
                avatarPlaceholder
            }
        }
        .frame(width: 26, height: 26)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.runEasyDivider, lineWidth: 0.5))
    }

    private var avatarPlaceholder: some View {
        ZStack {
            Color.runEasyCardBg
            Image(systemName: "person.fill")
                .foregroundColor(.runEasyText60)
                .font(.system(size: 12, weight: .medium))
        }
    }

    // MARK: - Pill

    private func statPill(icon: String, value: String, iconColor: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(iconColor)
            Text(value)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundColor(.runEasyTextPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 5)
        .padding(.vertical, 3)
        .background(Color.runEasyCardBg.opacity(0.7))
        .cornerRadius(8)
    }
}

#Preview {
    VStack(spacing: 8) {
        HeaderView(avatarUrl: nil, stats: .mock)
        HeaderView(avatarUrl: nil, stats: .zero)
    }
    .padding()
    .background(Color.runEasyNavy)
}

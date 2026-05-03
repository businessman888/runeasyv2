import SwiftUI

struct StartView: View {
    let userName: String
    let workout: PlannedWorkout?
    let onStart: (PlannedWorkout?) -> Void

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12:  return "Bom dia"
        case 12..<18: return "Boa tarde"
        default:      return "Boa noite"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                header

                if let workout = workout, workout.type != .rest {
                    workoutCard(workout)
                } else {
                    restCard
                }

                PrimaryActionButton(
                    workout?.type == .rest ? "Corrida Livre" : "Iniciar",
                    icon: "play.fill"
                ) {
                    onStart(workout)
                }
                .padding(.top, 2)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(greeting)
                .font(AppFont.captionMuted)
                .foregroundColor(.runEasyText60)
            Text(userName)
                .font(AppFont.titleLarge)
                .foregroundColor(.runEasyTextPrimary)
        }
    }

    private func workoutCard(_ workout: PlannedWorkout) -> some View {
        RunEasyCard(isActive: true) {
            VStack(alignment: .leading, spacing: 6) {
                Text(workout.type.displayName.uppercased())
                    .font(AppFont.labelSmall)
                    .foregroundColor(.runEasyCyan)
                    .tracking(0.6)

                Text(workout.title)
                    .font(AppFont.titleMedium)
                    .foregroundColor(.runEasyTextPrimary)

                Divider()
                    .background(Color.runEasyDivider)
                    .padding(.vertical, 1)

                HStack(spacing: 14) {
                    metric(label: "Dist", value: String(format: "%.1f km", workout.distanceKm))
                    metric(label: "Pace", value: "\(workout.targetPace)/km")
                }
            }
        }
    }

    private var restCard: some View {
        RunEasyCard(isActive: false) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 9, weight: .bold))
                    Text("DIA DE DESCANSO")
                        .font(AppFont.labelSmall)
                        .tracking(0.6)
                }
                .foregroundColor(.runEasyGreen)

                Text("Sem treino programado")
                    .font(AppFont.titleMedium)
                    .foregroundColor(.runEasyTextPrimary)
                Text("Pode rodar livre se quiser ✨")
                    .font(AppFont.captionMuted)
                    .foregroundColor(.runEasyText60)
            }
        }
    }

    private func metric(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased())
                .font(AppFont.labelSmall)
                .foregroundColor(.runEasyText40)
                .tracking(0.4)
            Text(value)
                .font(AppFont.metricSmall)
                .foregroundColor(.runEasyTextPrimary)
        }
    }
}

#Preview("With workout") {
    StartView(userName: "Matheus", workout: .mock, onStart: { _ in })
}

#Preview("Rest day") {
    StartView(userName: "Matheus", workout: nil, onStart: { _ in })
}

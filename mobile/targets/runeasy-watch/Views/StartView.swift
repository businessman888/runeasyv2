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
            VStack(alignment: .leading, spacing: 10) {
                Text("\(greeting),")
                    .font(.caption2)
                    .foregroundColor(.runEasyText60)
                Text(userName)
                    .font(.headline)
                    .foregroundColor(.runEasyTextPrimary)

                if let workout = workout, workout.type != .rest {
                    workoutCard(workout)
                } else {
                    restCard
                }

                Button {
                    onStart(workout)
                } label: {
                    HStack {
                        Image(systemName: "play.fill")
                        Text(workout?.type == .rest ? "Corrida Livre" : "Iniciar")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                }
                .buttonStyle(.borderedProminent)
                .tint(.runEasyCyan)
                .foregroundColor(.runEasyNavy)
                .padding(.top, 4)
            }
            .padding(.horizontal, 4)
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
    }

    private func workoutCard(_ workout: PlannedWorkout) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(workout.type.displayName.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.runEasyCyan)
            Text(workout.title)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.runEasyTextPrimary)
            HStack(spacing: 10) {
                metric(label: "Dist", value: String(format: "%.1f km", workout.distanceKm))
                metric(label: "Pace", value: "\(workout.targetPace)/km")
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyNavyLight)
        .cornerRadius(10)
    }

    private var restCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("DIA DE DESCANSO")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.runEasyGreen)
            Text("Sem treino programado")
                .font(.subheadline)
                .foregroundColor(.runEasyTextPrimary)
            Text("Pode rodar livre se quiser ✨")
                .font(.caption2)
                .foregroundColor(.runEasyText60)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyNavyLight)
        .cornerRadius(10)
    }

    private func metric(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(.runEasyText40)
            Text(value)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundColor(.runEasyTextPrimary)
        }
    }
}

#Preview("With workout") {
    StartView(
        userName: "Matheus",
        workout: .mock,
        onStart: { _ in }
    )
}

#Preview("Rest day") {
    StartView(
        userName: "Matheus",
        workout: nil,
        onStart: { _ in }
    )
}

import SwiftUI

/// Tela inicial do app — espelha a Home do app mobile (Figma 1058-1239 / 1109-1239).
/// Header com avatar + 3 stats da semana, label "Seus treinos" e card do dia
/// (treino programado OU descanso).
struct StartView: View {
    let userName: String
    let avatarUrl: String?
    let workout: PlannedWorkout?
    let weekStats: WeekStats
    let nextWorkout: NextWorkoutInfo?
    let onStart: (PlannedWorkout?) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HeaderView(avatarUrl: avatarUrl, stats: weekStats)
                    .padding(.bottom, 2)

                Text("Seus treinos")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.runEasyTextPrimary)
                    .padding(.horizontal, 2)

                if let workout = workout, workout.type != .rest {
                    WorkoutDayCard(workout: workout) {
                        onStart(workout)
                    }
                } else {
                    RestDayCard(nextWorkout: nextWorkout)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
    }
}

#Preview("Workout day") {
    StartView(
        userName: "Matheus",
        avatarUrl: nil,
        workout: .mock,
        weekStats: .mock,
        nextWorkout: nil,
        onStart: { _ in }
    )
}

#Preview("Workout completed") {
    var w = PlannedWorkout.mock
    w.status = .completed
    return StartView(
        userName: "Matheus",
        avatarUrl: nil,
        workout: w,
        weekStats: .mock,
        nextWorkout: nil,
        onStart: { _ in }
    )
}

#Preview("Rest day") {
    StartView(
        userName: "Matheus",
        avatarUrl: nil,
        workout: nil,
        weekStats: .mock,
        nextWorkout: .mock,
        onStart: { _ in }
    )
}

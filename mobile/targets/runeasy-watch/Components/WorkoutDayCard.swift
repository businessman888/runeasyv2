import SwiftUI

/// Card do treino do dia matching Figma (node 1058-1250 / 1060-1343).
/// Mirror visual do `WorkoutCard.tsx` do app mobile.
///
/// Estados:
///   - .pending → botão cyan "Começar treino" habilitado
///   - .completed → botão desabilitado mostrando "Concluído ✓"
struct WorkoutDayCard: View {
    let workout: PlannedWorkout
    let onStart: () -> Void

    private var isCompleted: Bool { workout.isCompleted }

    private var formattedDuration: String {
        guard let s = workout.targetDurationSeconds, s > 0 else { return "—" }
        let m = s / 60
        let sec = s % 60
        return String(format: "%d:%02d", m, sec)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            topSection
            divider
            statsSection
            actionButton
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyCardBg)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.runEasyCyan, lineWidth: 1.5)
        )
        .neonGlow(color: .runEasyCyan, radius: 6, opacity: 0.20)
    }

    // MARK: - Sections

    private var topSection: some View {
        HStack(alignment: .top, spacing: 4) {
            VStack(alignment: .leading, spacing: 2) {
                if let dateLabel = workout.dateLabel, !dateLabel.isEmpty {
                    Text(dateLabel)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.runEasyText60)
                }
                Text(workout.title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.runEasyTextPrimary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                if let intensity = workout.intensity, !intensity.isEmpty {
                    HStack(spacing: 3) {
                        Text("Intensidade:")
                            .font(.system(size: 9, weight: .regular))
                            .foregroundColor(.runEasyText60)
                        Text(intensity)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.runEasyCyan)
                    }
                }
            }
            Spacer(minLength: 4)
            checkbox
        }
    }

    private var checkbox: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .strokeBorder(
                    isCompleted ? Color.runEasySuccess : Color.runEasyText60,
                    lineWidth: 1.2
                )
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(isCompleted ? Color.runEasySuccess.opacity(0.18) : Color.clear)
                )
                .frame(width: 16, height: 16)
            if isCompleted {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.runEasySuccess)
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.runEasyDivider)
            .frame(height: 1)
            .padding(.vertical, 1)
    }

    private var statsSection: some View {
        HStack(alignment: .top, spacing: 6) {
            stat(label: "Distância", value: "\(formatKm(workout.distanceKm)) km")
            stat(label: "Tempo", value: formattedDuration)
            stat(label: "Pace", value: workout.targetPace.isEmpty ? "—" : "\(workout.targetPace)/km")
            Spacer(minLength: 0)
        }
    }

    private func stat(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased())
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(.runEasyText60)
                .tracking(0.3)
            Text(value)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundColor(.runEasyTextPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var actionButton: some View {
        Group {
            if isCompleted {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.runEasySuccess)
                    Text("Concluído")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.runEasySuccess)
                }
                .frame(maxWidth: .infinity, minHeight: 28)
                .background(Color.runEasySuccess.opacity(0.10))
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color.runEasySuccess.opacity(0.40), lineWidth: 1)
                )
            } else {
                PrimaryActionButton(
                    "Começar treino",
                    icon: "figure.run",
                    tint: .runEasyCyan,
                    foreground: .runEasyNavy
                ) {
                    onStart()
                }
            }
        }
        .padding(.top, 2)
    }

    private func formatKm(_ km: Double) -> String {
        if km == km.rounded() { return String(format: "%.0f", km) }
        return String(format: "%.1f", km)
    }
}

#Preview("Pending") {
    WorkoutDayCard(workout: .mock, onStart: {})
        .padding()
        .background(Color.runEasyNavy)
}

#Preview("Completed") {
    var w = PlannedWorkout.mock
    w.status = .completed
    return WorkoutDayCard(workout: w, onStart: {})
        .padding()
        .background(Color.runEasyNavy)
}

import SwiftUI

struct RunSummaryView: View {
    let run: CompletedRun
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                checkBadge

                Text("Treino Concluído")
                    .font(AppFont.titleLarge)
                    .foregroundColor(.runEasyTextPrimary)

                summaryCard

                PrimaryActionButton("OK") {
                    onDone()
                }

                Text("Detalhes completos no iPhone")
                    .font(AppFont.captionMuted)
                    .foregroundColor(.runEasyText40)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
    }

    // MARK: - Sections

    private var checkBadge: some View {
        ZStack {
            Circle()
                .fill(Color.runEasySuccess.opacity(0.18))
                .frame(width: 44, height: 44)
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.runEasySuccess)
        }
        .neonGlow(color: .runEasySuccess, radius: 8, opacity: 0.30)
        .padding(.top, 4)
    }

    private var summaryCard: some View {
        RunEasyCard(isActive: true, glowColor: .runEasyCyan) {
            VStack(spacing: 8) {
                summaryRow(
                    label: "Distância",
                    value: "\(MetricFormat.distance(run.totalDistanceMeters)) km",
                    color: .runEasyTextPrimary
                )
                divider
                summaryRow(
                    label: "Tempo",
                    value: MetricFormat.time(run.durationSeconds),
                    color: .runEasyCyan
                )
                divider
                summaryRow(
                    label: "Pace médio",
                    value: "\(MetricFormat.pace(run.avgPaceSecondsPerKm))/km",
                    color: .runEasyGreen
                )
                if let maxHr = run.maxHeartRate {
                    divider
                    summaryRow(label: "FC máx", value: "\(maxHr) bpm", color: .runEasyRed)
                }
                if let avgHr = run.avgHeartRate {
                    divider
                    summaryRow(label: "FC média", value: "\(avgHr) bpm", color: .runEasyRed)
                }
                if let cal = run.calories {
                    divider
                    summaryRow(label: "Calorias", value: "\(cal) kcal", color: .runEasyOrange)
                }
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.runEasyDivider)
            .frame(height: 1)
    }

    private func summaryRow(label: String, value: String, color: Color) -> some View {
        HStack {
            Text(label.uppercased())
                .font(AppFont.labelSmall)
                .foregroundColor(.runEasyText40)
                .tracking(0.4)
            Spacer()
            Text(value)
                .font(AppFont.metricSmall)
                .foregroundColor(color)
        }
    }
}

#Preview {
    NavigationStack {
        RunSummaryView(
            run: CompletedRun(
                workoutId: "mock-001",
                totalDistanceMeters: 4500,
                durationSeconds: 1620,
                avgPaceSecondsPerKm: 360,
                avgHeartRate: 148,
                maxHeartRate: 162,
                calories: 270,
                routePoints: [],
                startedAt: ISO8601DateFormatter().string(from: Date()),
                source: "apple_watch"
            ),
            onDone: { }
        )
    }
}

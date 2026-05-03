import SwiftUI

struct RunSummaryView: View {
    let metrics: RunMetrics
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
                summaryRow(label: "Distância", value: "\(MetricFormat.distance(metrics.distanceMeters)) km", color: .runEasyTextPrimary)
                divider
                summaryRow(label: "Tempo", value: MetricFormat.time(metrics.elapsedSeconds), color: .runEasyCyan)
                divider
                summaryRow(label: "Pace médio", value: "\(MetricFormat.pace(metrics.avgPaceSecondsPerKm))/km", color: .runEasyGreen)
                if metrics.maxHeartRate > 0 {
                    divider
                    summaryRow(label: "FC máx", value: "\(metrics.maxHeartRate) bpm", color: .runEasyRed)
                }
                if metrics.calories > 0 {
                    divider
                    summaryRow(label: "Calorias", value: "\(metrics.calories) kcal", color: .runEasyOrange)
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
            metrics: RunMetrics(
                elapsedSeconds: 1620,
                distanceMeters: 4500,
                currentPaceSecondsPerKm: 360,
                avgPaceSecondsPerKm: 360,
                heartRate: 148,
                maxHeartRate: 162,
                calories: 270
            ),
            onDone: { }
        )
    }
}

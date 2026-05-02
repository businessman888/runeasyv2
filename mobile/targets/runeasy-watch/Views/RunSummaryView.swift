import SwiftUI

struct RunSummaryView: View {
    let metrics: RunMetrics
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.runEasyGreen)
                Text("Treino Concluído")
                    .font(.headline)
                    .foregroundColor(.runEasyTextPrimary)

                VStack(spacing: 6) {
                    summaryRow(label: "Distância", value: "\(MetricFormat.distance(metrics.distanceMeters)) km")
                    summaryRow(label: "Tempo",     value: MetricFormat.time(metrics.elapsedSeconds))
                    summaryRow(label: "Pace médio", value: "\(MetricFormat.pace(metrics.avgPaceSecondsPerKm))/km")
                    if let hr = metrics.heartRate, metrics.maxHeartRate > 0 {
                        summaryRow(label: "FC",     value: "\(hr) avg")
                        summaryRow(label: "FC máx", value: "\(metrics.maxHeartRate) bpm")
                    }
                    if metrics.calories > 0 {
                        summaryRow(label: "Calorias", value: "\(metrics.calories) kcal")
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity)
                .background(Color.runEasyNavyLight)
                .cornerRadius(10)

                Button {
                    onDone()
                } label: {
                    Text("OK").fontWeight(.semibold).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.runEasyCyan)
                .foregroundColor(.runEasyNavy)

                Text("Detalhes completos no iPhone")
                    .font(.caption2)
                    .foregroundColor(.runEasyText40)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 4)
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
    }

    private func summaryRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.runEasyText60)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundColor(.runEasyTextPrimary)
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

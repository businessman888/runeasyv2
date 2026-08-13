import SwiftUI

struct RunSummaryView: View {
    let run: CompletedRun
    /// Transferências ainda na fila do WatchConnectivity. > 0 significa que a
    /// corrida ainda não chegou ao iPhone — o envio é durável (transferUserInfo
    /// tem retry automático), mas o usuário precisa saber que está pendente.
    var pendingTransfers: Int = 0
    var deliveryAck: RunDeliveryAck?
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                checkBadge

                Text("Treino Concluído")
                    .font(AppFont.titleLarge)
                    .foregroundColor(.runEasyTextPrimary)

                summaryCard

                if let warning = run.completionWarning {
                    HStack(alignment: .top, spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                        Text(warning)
                            .multilineTextAlignment(.leading)
                    }
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.runEasyWarning)
                }

                PrimaryActionButton("OK") {
                    onDone()
                }

                deliveryStatus

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

    private var deliveryStatus: some View {
        Group {
            if let deliveryAck, deliveryAck.runId == run.runId {
                switch deliveryAck.status {
                case .serverAccepted:
                    Label("Salvo no RunEasy", systemImage: "checkmark.icloud.fill")
                        .foregroundColor(.runEasySuccess)
                case .pendingSync:
                    Label("Salvo no iPhone — sincronização pendente", systemImage: "arrow.triangle.2.circlepath")
                        .foregroundColor(.runEasyWarning)
                }
            } else if pendingTransfers > 0 {
                Label("Enviando ao iPhone…", systemImage: "arrow.triangle.2.circlepath")
                    .foregroundColor(.runEasyWarning)
            } else {
                Label("Aguardando confirmação do iPhone", systemImage: "iphone.and.arrow.forward")
                    .foregroundColor(.runEasyText60)
            }
        }
        .font(.system(size: 8, weight: .medium))
        .multilineTextAlignment(.center)
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
                runId: "mock-run-001",
                workoutId: "mock-001",
                totalDistanceMeters: 4500,
                durationSeconds: 1620,
                avgPaceSecondsPerKm: 360,
                avgHeartRate: 148,
                maxHeartRate: 162,
                calories: 270,
                routePoints: [],
                startedAt: ISO8601DateFormatter().string(from: Date()),
                source: "apple_watch",
                healthKitSaved: true,
                routeSaved: true,
                completionWarning: nil
            ),
            deliveryAck: RunDeliveryAck(
                runId: "mock-run-001",
                status: .serverAccepted,
                acknowledgedAt: ISO8601DateFormatter().string(from: Date())
            ),
            onDone: { }
        )
    }
}

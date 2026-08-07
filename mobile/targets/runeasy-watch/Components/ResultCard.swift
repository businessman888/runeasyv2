import SwiftUI

/// Resumo da última corrida de um escopo — o "card de resultado" que o usuário
/// pediu ao arrastar a tela inicial (AUDITORIA §P2).
///
/// Mostra só métricas. A análise do Coach fica no iPhone: os textos não trafegam
/// no applicationContext (estourariam o limite) e não são legíveis no relógio.
struct ResultCard: View {
    let result: RunResultForWatch

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            divider
            metricsGrid
            if let hr = result.avgHeartRate {
                divider
                row(label: "FC MÉDIA", value: "\(hr) bpm", color: .runEasyRed)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyCardBg)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.runEasyCyan.opacity(0.45), lineWidth: 1)
        )
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(result.title)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.runEasyTextPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 2)
            if !result.dateLabel.isEmpty {
                Text(result.dateLabel)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.runEasyText60)
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.runEasyDivider)
            .frame(height: 1)
    }

    private var metricsGrid: some View {
        HStack(alignment: .top, spacing: 6) {
            metric(label: "DISTÂNCIA", value: "\(MetricFormat.distance(result.distanceKm * 1000)) km")
            metric(label: "TEMPO", value: MetricFormat.time(result.durationSeconds))
            metric(label: "PACE", value: result.pace.isEmpty ? "—" : result.pace)
            Spacer(minLength: 0)
        }
    }

    private func metric(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 7, weight: .semibold))
                .foregroundColor(.runEasyText60)
                .tracking(0.3)
            Text(value)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundColor(.runEasyTextPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private func row(label: String, value: String, color: Color) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(.runEasyText60)
                .tracking(0.3)
            Spacer()
            Text(value)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundColor(color)
        }
    }
}

/// Estado vazio com paridade textual ao `FriendlyEmptyCard` do app mobile.
struct EmptyStateCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .regular))
                .foregroundColor(.runEasyText40)
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.runEasyTextPrimary)
                .multilineTextAlignment(.center)
            Text(subtitle)
                .font(.system(size: 8, weight: .regular))
                .foregroundColor(.runEasyText60)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Color.runEasyCardBg.opacity(0.6))
        .cornerRadius(12)
    }
}

#Preview("Resultado") {
    VStack(spacing: 8) {
        ResultCard(result: .mockPlan)
        ResultCard(result: .mockActivity)
    }
    .padding()
    .background(Color.runEasyNavy)
}

#Preview("Vazio") {
    EmptyStateCard(
        icon: "chart.bar.xaxis",
        title: "Nenhum resultado ainda",
        subtitle: "Os resumos das suas corridas aparecem aqui após você treinar."
    )
    .padding()
    .background(Color.runEasyNavy)
}

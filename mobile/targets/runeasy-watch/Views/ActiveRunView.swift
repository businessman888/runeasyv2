import SwiftUI
import WatchKit

struct ActiveRunView: View {
    let workout: PlannedWorkout?
    let onFinish: (RunMetrics) -> Void
    let onCancel: () -> Void

    @State private var metrics = RunMetrics()
    @State private var showStopConfirmation = false

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var status: RunStatus { metrics.isPaused ? .paused : .running }

    var body: some View {
        TabView {
            primaryMetricsPage.tag(0)
            secondaryMetricsPage.tag(1)
            controlsPage.tag(2)
        }
        .tabViewStyle(.verticalPage)
        .background(Color.runEasyNavy.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .onReceive(timer) { _ in tick() }
        .alert("Finalizar corrida?", isPresented: $showStopConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Finalizar", role: .destructive) {
                WKInterfaceDevice.current().play(.success)
                onFinish(metrics)
            }
        } message: {
            Text("Você não poderá retomar.")
        }
    }

    // MARK: - Pages

    private var primaryMetricsPage: some View {
        VStack(spacing: 0) {
            HStack {
                StatusBanner(status: status)
                Spacer()
            }
            .padding(.horizontal, 6)
            .padding(.bottom, 4)

            heroMetric(
                value: MetricFormat.time(metrics.elapsedSeconds),
                label: "Tempo",
                color: .runEasyCyan
            )
            divider
            heroMetric(
                value: MetricFormat.distance(metrics.distanceMeters),
                label: "Km",
                color: .runEasyTextPrimary
            )
            divider
            heroMetric(
                value: MetricFormat.pace(metrics.currentPaceSecondsPerKm),
                label: "Pace /km",
                color: .runEasyGreen
            )
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var secondaryMetricsPage: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                StatusBanner(status: status)
                Spacer()
            }
            .padding(.bottom, 2)

            secondaryRow(
                icon: "heart.fill",
                color: .runEasyRed,
                label: "FC",
                value: metrics.heartRate.map { "\($0) bpm" } ?? "--"
            )
            secondaryRow(
                icon: "flame.fill",
                color: .runEasyOrange,
                label: "Calorias",
                value: "\(metrics.calories) kcal"
            )
            secondaryRow(
                icon: "stopwatch",
                color: .runEasyCyan,
                label: "Pace médio",
                value: "\(MetricFormat.pace(metrics.avgPaceSecondsPerKm))/km"
            )
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var controlsPage: some View {
        VStack(spacing: 8) {
            HStack {
                StatusBanner(status: status)
                Spacer()
            }
            .padding(.bottom, 2)

            PrimaryActionButton(
                metrics.isPaused ? "Retomar" : "Pausar",
                icon: metrics.isPaused ? "play.fill" : "pause.fill",
                tint: metrics.isPaused ? .runEasyGreen : .runEasyWarning,
                foreground: .runEasyNavy
            ) {
                togglePause()
            }

            PrimaryActionButton(
                "Finalizar",
                icon: "stop.fill",
                tint: .runEasyRed,
                foreground: .runEasyTextPrimary
            ) {
                WKInterfaceDevice.current().play(.notification)
                showStopConfirmation = true
            }
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Components

    private var divider: some View {
        Rectangle()
            .fill(Color.runEasyDivider)
            .frame(height: 1)
            .padding(.vertical, 2)
    }

    private func heroMetric(value: String, label: String, color: Color) -> some View {
        VStack(spacing: -2) {
            Text(value)
                .font(AppFont.metricLarge)
                .foregroundColor(color)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Text(label.uppercased())
                .font(AppFont.labelSmall)
                .foregroundColor(.runEasyText40)
                .tracking(0.6)
        }
        .frame(maxWidth: .infinity)
    }

    private func secondaryRow(icon: String, color: Color, label: String, value: String) -> some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 26, height: 26)
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(color)
            }
            VStack(alignment: .leading, spacing: -1) {
                Text(label.uppercased())
                    .font(AppFont.labelSmall)
                    .foregroundColor(.runEasyText40)
                    .tracking(0.4)
                Text(value)
                    .font(AppFont.metricMedium)
                    .foregroundColor(.runEasyTextPrimary)
            }
            Spacer()
        }
    }

    // MARK: - Mock data progression
    // NOTE: substituido por HealthKitManager na Fase 3.

    private func tick() {
        guard !metrics.isPaused else { return }
        metrics.elapsedSeconds += 1
        let jitter = Double.random(in: 0.97...1.03)
        metrics.distanceMeters += 2.78 * jitter
        metrics.currentPaceSecondsPerKm = 360.0 / jitter
        if metrics.distanceMeters > 0 {
            metrics.avgPaceSecondsPerKm = Double(metrics.elapsedSeconds) / (metrics.distanceMeters / 1000.0)
        }
        let phase = Double(metrics.elapsedSeconds) / 8.0
        let hr = 145 + Int((sin(phase) * 15).rounded())
        metrics.heartRate = hr
        if hr > metrics.maxHeartRate { metrics.maxHeartRate = hr }
        metrics.calories = Int(Double(metrics.elapsedSeconds) * 0.167)
    }

    private func togglePause() {
        metrics.isPaused.toggle()
        WKInterfaceDevice.current().play(metrics.isPaused ? .stop : .start)
    }
}

#Preview {
    NavigationStack {
        ActiveRunView(workout: .mock, onFinish: { _ in }, onCancel: { })
    }
}

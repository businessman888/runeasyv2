import SwiftUI

struct ActiveRunView: View {
    let workout: PlannedWorkout?
    let onFinish: (RunMetrics) -> Void
    let onCancel: () -> Void

    @State private var metrics = RunMetrics()
    @State private var showStopConfirmation = false
    @State private var startTimestamp: Date = Date()
    @State private var pausedDuration: TimeInterval = 0
    @State private var pauseStartedAt: Date? = nil

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        TabView {
            primaryMetricsPage
                .tag(0)
            secondaryMetricsPage
                .tag(1)
            controlsPage
                .tag(2)
        }
        .tabViewStyle(.verticalPage)
        .background(Color.runEasyNavy.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .onReceive(timer) { _ in tick() }
        .alert("Finalizar corrida?", isPresented: $showStopConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Finalizar", role: .destructive) { onFinish(metrics) }
        } message: {
            Text("Você não poderá retomar.")
        }
    }

    // MARK: - Pages

    private var primaryMetricsPage: some View {
        VStack(spacing: 4) {
            metricLarge(
                value: MetricFormat.time(metrics.elapsedSeconds),
                label: "Tempo",
                color: .runEasyCyan
            )
            Divider().background(Color.runEasyText40)
            metricLarge(
                value: MetricFormat.distance(metrics.distanceMeters),
                label: "km",
                color: .runEasyTextPrimary
            )
            Divider().background(Color.runEasyText40)
            metricLarge(
                value: MetricFormat.pace(metrics.currentPaceSecondsPerKm),
                label: "Pace /km",
                color: .runEasyGreen
            )
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var secondaryMetricsPage: some View {
        VStack(alignment: .leading, spacing: 12) {
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
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var controlsPage: some View {
        VStack(spacing: 10) {
            Button {
                togglePause()
            } label: {
                HStack {
                    Image(systemName: metrics.isPaused ? "play.fill" : "pause.fill")
                    Text(metrics.isPaused ? "Retomar" : "Pausar").fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(metrics.isPaused ? .runEasyGreen : .runEasyYellow)
            .foregroundColor(.runEasyNavy)

            Button {
                showStopConfirmation = true
            } label: {
                HStack {
                    Image(systemName: "stop.fill")
                    Text("Finalizar").fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.runEasyRed)
            .foregroundColor(.runEasyTextPrimary)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Components

    private func metricLarge(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.system(size: 32, weight: .semibold, design: .rounded))
                .foregroundColor(color)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.runEasyText40)
        }
        .frame(maxWidth: .infinity)
    }

    private func secondaryRow(icon: String, color: Color, label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(color)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .font(.system(size: 9))
                    .foregroundColor(.runEasyText40)
                Text(value)
                    .font(.system(size: 16, weight: .medium, design: .rounded))
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
        // Mock: ~2.78 m/s = ~6:00 /km running pace, with ±3% jitter
        let jitter = Double.random(in: 0.97...1.03)
        metrics.distanceMeters += 2.78 * jitter
        metrics.currentPaceSecondsPerKm = 360.0 / jitter
        if metrics.distanceMeters > 0 {
            metrics.avgPaceSecondsPerKm = Double(metrics.elapsedSeconds) / (metrics.distanceMeters / 1000.0)
        }
        // Mock HR: oscillates 130-160 BPM
        let phase = Double(metrics.elapsedSeconds) / 8.0
        let hr = 145 + Int((sin(phase) * 15).rounded())
        metrics.heartRate = hr
        if hr > metrics.maxHeartRate { metrics.maxHeartRate = hr }
        // Mock calories: ~10 kcal/min = ~0.167/sec
        metrics.calories = Int(Double(metrics.elapsedSeconds) * 0.167)
    }

    private func togglePause() {
        metrics.isPaused.toggle()
    }
}

#Preview {
    NavigationStack {
        ActiveRunView(workout: .mock, onFinish: { _ in }, onCancel: { })
    }
}

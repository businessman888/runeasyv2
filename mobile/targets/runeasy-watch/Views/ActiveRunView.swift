import SwiftUI
import WatchKit

struct ActiveRunView: View {
    let workout: PlannedWorkout?
    let onFinish: (CompletedRun) -> Void
    let onCancel: () -> Void

    @StateObject private var workoutManager = WorkoutManager()
    @State private var showStopConfirmation = false
    @State private var showPermissionError = false

    private var status: RunStatus { workoutManager.metrics.isPaused ? .paused : .running }
    private var metrics: RunMetrics { workoutManager.metrics }

    var body: some View {
        Group {
            if workoutManager.isRunning {
                runningContent
            } else if workoutManager.permissionError != nil {
                // Mostrado brevemente antes do alert ser exibido
                loadingContent
            } else {
                loadingContent
            }
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .task {
            await startIfNeeded()
        }
        .alert("Finalizar corrida?", isPresented: $showStopConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Finalizar", role: .destructive) {
                finalize()
            }
        } message: {
            Text("Você não poderá retomar.")
        }
        .alert("Permissão necessária", isPresented: $showPermissionError) {
            Button("OK", role: .cancel) {
                onCancel()
            }
        } message: {
            Text(workoutManager.permissionError ?? "Permita acesso a Saúde e Localização nas configurações do Apple Watch para usar esta função.")
        }
        .onChange(of: workoutManager.permissionError) { _, newValue in
            if newValue != nil { showPermissionError = true }
        }
    }

    // MARK: - States

    private var loadingContent: some View {
        VStack(spacing: 8) {
            ProgressView()
                .controlSize(.large)
                .tint(.runEasyCyan)
            Text("Preparando…")
                .font(AppFont.captionMuted)
                .foregroundColor(.runEasyText60)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var runningContent: some View {
        TabView {
            primaryMetricsPage.tag(0)
            secondaryMetricsPage.tag(1)
            controlsPage.tag(2)
        }
        .tabViewStyle(.verticalPage)
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
                value: metrics.calories > 0 ? "\(metrics.calories) kcal" : "--"
            )
            secondaryRow(
                icon: "stopwatch",
                color: .runEasyCyan,
                label: "Pace médio",
                value: metrics.distanceMeters > 0 ? "\(MetricFormat.pace(metrics.avgPaceSecondsPerKm))/km" : "--"
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

    // MARK: - Actions

    private func startIfNeeded() async {
        guard !workoutManager.isRunning else { return }
        await workoutManager.requestAuthorization()
        guard workoutManager.hasPermission else { return }
        await workoutManager.startWorkout(workoutId: workout?.id)
    }

    private func togglePause() {
        if metrics.isPaused {
            workoutManager.resume()
            WKInterfaceDevice.current().play(.start)
        } else {
            workoutManager.pause()
            WKInterfaceDevice.current().play(.stop)
        }
    }

    private func finalize() {
        WKInterfaceDevice.current().play(.success)
        Task {
            let run = await workoutManager.endWorkout()
            onFinish(run)
        }
    }
}

#Preview {
    NavigationStack {
        ActiveRunView(workout: .mock, onFinish: { _ in }, onCancel: { })
    }
}

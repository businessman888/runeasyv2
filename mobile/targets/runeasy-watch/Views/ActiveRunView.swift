import SwiftUI
import WatchKit

/// Tela de corrida ativa — matching Figma node 1074-1239 (running) e 1089-1282 (paused).
/// Layout single-page:
///   - Topo: label "Tempo" + timer grande (cyan quando rodando, amarelo quando pausado)
///   - Meio: Distância (esquerda) + Pace (direita) com ícones
///   - Base: botões circulares
///       Rodando → 1 botão cyan (stop = pausar)
///       Pausado → 2 botões (resume outline + finish cyan)
struct ActiveRunView: View {
    let workout: PlannedWorkout?
    let onFinish: (CompletedRun) -> Void
    let onCancel: () -> Void

    @StateObject private var workoutManager = WorkoutManager()
    @State private var showStopConfirmation = false
    @State private var showPermissionError = false

    private var metrics: RunMetrics { workoutManager.metrics }

    var body: some View {
        Group {
            if workoutManager.isRunning {
                runningContent
            } else {
                loadingContent
            }
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .task { await startIfNeeded() }
        .alert("Finalizar corrida?", isPresented: $showStopConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Finalizar", role: .destructive) { finalize() }
        } message: {
            Text("Você não poderá retomar.")
        }
        .alert("Permissão necessária", isPresented: $showPermissionError) {
            Button("OK", role: .cancel) { onCancel() }
        } message: {
            Text(workoutManager.permissionError ?? "Permita acesso a Saúde e Localização nas configurações do Apple Watch.")
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
                .font(.system(size: 11))
                .foregroundColor(.runEasyText60)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var runningContent: some View {
        VStack(spacing: 6) {
            timerSection
            metricsSection
            Spacer(minLength: 0)
            controlsSection
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Sections

    private var timerSection: some View {
        VStack(spacing: 1) {
            Text("Tempo")
                .font(.system(size: 10, weight: .regular))
                .foregroundColor(.runEasyText60)
            Text(MetricFormat.time(metrics.elapsedSeconds))
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundColor(metrics.isPaused ? .runEasyWarning : .runEasyCyan)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
    }

    private var metricsSection: some View {
        HStack(spacing: 4) {
            metricBlock(
                icon: "figure.run",
                label: "Distance",
                value: "\(MetricFormat.distance(metrics.distanceMeters)) Km"
            )
            metricBlock(
                icon: "stopwatch.fill",
                label: "Pace",
                value: paceLabel
            )
        }
    }

    private var paceLabel: String {
        let s = metrics.currentPaceSecondsPerKm
        guard s.isFinite, s > 0 else { return "— Min" }
        let min = s / 60.0
        return String(format: "%.1f Min", min)
    }

    private func metricBlock(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.runEasyCyan)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .font(.system(size: 8, weight: .regular))
                    .foregroundColor(.runEasyText60)
                Text(value)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(.runEasyTextPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var controlsSection: some View {
        Group {
            if metrics.isPaused {
                pausedControls
            } else {
                runningControls
            }
        }
        .padding(.bottom, 2)
    }

    /// Rodando — 1 botão central cyan (= pausar)
    private var runningControls: some View {
        HStack {
            Spacer()
            CircleIconButton(
                icon: "pause.fill",
                fillColor: .runEasyCyan,
                iconColor: .runEasyNavy,
                size: 44
            ) {
                togglePause()
            }
            Spacer()
        }
    }

    /// Pausado — 2 botões: resume (outline) + finish (cyan filled)
    private var pausedControls: some View {
        HStack(spacing: 14) {
            Spacer()
            CircleIconButton(
                icon: "play.fill",
                fillColor: .runEasyCardBg,
                iconColor: .runEasyCyan,
                strokeColor: .runEasyCyan,
                strokeWidth: 1.5,
                size: 44
            ) {
                togglePause()
            }
            CircleIconButton(
                icon: "flag.fill",
                fillColor: .runEasyCyan,
                iconColor: .runEasyNavy,
                size: 44
            ) {
                WKInterfaceDevice.current().play(.notification)
                showStopConfirmation = true
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

// MARK: - CircleIconButton (componente local)

private struct CircleIconButton: View {
    let icon: String
    let fillColor: Color
    let iconColor: Color
    var strokeColor: Color? = nil
    var strokeWidth: CGFloat = 0
    let size: CGFloat
    let action: () -> Void

    var body: some View {
        Button(action: {
            WKInterfaceDevice.current().play(.click)
            action()
        }) {
            ZStack {
                Circle().fill(fillColor)
                if let strokeColor, strokeWidth > 0 {
                    Circle().strokeBorder(strokeColor, lineWidth: strokeWidth)
                }
                Image(systemName: icon)
                    .font(.system(size: size * 0.40, weight: .bold))
                    .foregroundColor(iconColor)
            }
            .frame(width: size, height: size)
            .neonGlow(color: fillColor == .runEasyCyan ? .runEasyCyan : .clear, radius: 8, opacity: 0.35)
        }
        .buttonStyle(PressScaleStyleLocal())
    }
}

private struct PressScaleStyleLocal: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

#Preview {
    NavigationStack {
        ActiveRunView(workout: .mock, onFinish: { _ in }, onCancel: { })
    }
}

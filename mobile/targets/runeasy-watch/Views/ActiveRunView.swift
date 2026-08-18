import SwiftUI
import WatchKit

/// Tela de tracking do treino no Apple Watch.
///
/// Fluxo (o card da Home só ABRE esta tela — não inicia nada):
///   .idle    → resumo do treino + botão de play grande. HealthKit ainda não é tocado.
///   .authorizing → prompt explícito, disparado pelo play.
///   .starting→ "Iniciando…" com watchdog de 12s no WorkoutManager
///   .running → Figma 1074-1239 (rodando) / 1089-1282 (pausado)
///   .failed  → erro legível com "Tentar novamente" e "Voltar"
///
/// Layout do estado rodando:
///   - Topo: label "Tempo" + timer grande (cyan quando rodando, amarelo quando pausado)
///   - Meio: Distância (esquerda) + Pace (direita) com ícones
///   - Base: botões circulares
///       Rodando → 1 botão cyan (pausar)
///       Pausado → 2 botões (resume outline + finish cyan)
struct ActiveRunView: View {
    @ObservedObject var workoutManager: WorkoutManager
    let workout: PlannedWorkout?
    let onFinish: (CompletedRun) -> Void
    let onCancel: () -> Void

    @State private var showStopConfirmation = false
    @State private var controlsArmed = false

    private var metrics: RunMetrics { workoutManager.metrics }

    var body: some View {
        Group {
            switch workoutManager.phase {
            case .idle:
                idleContent
            case .authorizing:
                startingContent(label: "Autorizando…")
            case .starting:
                startingContent(label: "Iniciando…")
            case .running:
                runningContent
            case .failed(let message):
                failedContent(message)
            case .finalizing:
                startingContent(label: "Finalizando…")
            case .finished:
                startingContent(label: "Finalizando…")
            }
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
        .onAppear {
            WatchLaunchDiagnostics.markTrackingVisible()
        }
        .task {
            // Impede que o mesmo gesto que abriu a tela atravesse a troca de
            // views e acione o Play recém-montado no mesmo ponto da tela.
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            controlsArmed = true
            WatchLaunchDiagnostics.mark("tracking.controls-armed")
        }
        .alert("Finalizar corrida?", isPresented: $showStopConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Finalizar", role: .destructive) { finalize() }
        } message: {
            Text("Você não poderá retomar.")
        }
    }

    // MARK: - Idle (pronto para começar)

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(workout?.title ?? "Treino Livre")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.runEasyTextPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                if let workout {
                    targetsRow(for: workout)
                }

                CircleIconButton(
                    icon: "play.fill",
                    fillColor: .runEasyCyan,
                    iconColor: .runEasyNavy,
                    size: 56
                ) {
                    start()
                }
                .disabled(!controlsArmed)
                .opacity(controlsArmed ? 1 : 0.55)
                .padding(.top, 2)

                Text(controlsArmed ? "Toque para começar" : "Preparando controles…")
                    .font(.system(size: 9))
                    .foregroundColor(.runEasyText60)

                PressScaleButton(action: onCancel, haptic: .click) {
                    Text("Voltar")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.runEasyText60)
                        .frame(minHeight: 24)
                }
                .buttonStyle(.plain)

                if let permissionError = workoutManager.permissionError {
                    Text(permissionError)
                        .font(.system(size: 8))
                        .foregroundColor(.runEasyWarning)
                        .multilineTextAlignment(.center)
                        .padding(.top, 2)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
        }
    }

    private func targetsRow(for workout: PlannedWorkout) -> some View {
        HStack(spacing: 10) {
            if workout.distanceKm > 0 {
                targetChip(label: "META", value: "\(MetricFormat.km(workout.distanceKm)) km")
            }
            if !workout.targetPace.isEmpty {
                targetChip(label: "PACE", value: "\(workout.targetPace)/km")
            }
        }
    }

    private func targetChip(label: String, value: String) -> some View {
        VStack(spacing: 1) {
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(.runEasyText60)
                .tracking(0.3)
            Text(value)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundColor(.runEasyCyan)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(Color.runEasyCardBg)
        .cornerRadius(8)
    }

    // MARK: - Starting

    private func startingContent(label: String) -> some View {
        VStack(spacing: 8) {
            ProgressView()
                .controlSize(.large)
                .tint(.runEasyCyan)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.runEasyText60)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Failed

    private func failedContent(_ message: String) -> some View {
        ScrollView {
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.runEasyWarning)
                    .padding(.top, 4)

                Text(message)
                    .font(.system(size: 10))
                    .foregroundColor(.runEasyTextPrimary)
                    .multilineTextAlignment(.center)

                PrimaryActionButton("Tentar novamente", icon: "arrow.clockwise") {
                    workoutManager.reset()
                    controlsArmed = true
                    start()
                }

                PressScaleButton(action: { onCancel() }) {
                    Text("Voltar")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.runEasyText60)
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Running

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
                label: "Distância",
                value: "\(MetricFormat.distance(metrics.distanceMeters)) km"
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
        guard s.isFinite, s > 0 else { return "--:--" }
        return "\(MetricFormat.pace(s))/km"
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

    private func start() {
        guard controlsArmed else {
            WatchLaunchDiagnostics.mark("play.ignored-not-armed")
            return
        }
        controlsArmed = false
        WatchLaunchDiagnostics.mark("play.tap")
        WKInterfaceDevice.current().play(.start)
        Task {
            await workoutManager.prepareWorkoutStart(workoutId: workout?.id)
        }
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

#Preview("Treino do plano") {
    ActiveRunView(
        workoutManager: WorkoutManager(),
        workout: .mock,
        onFinish: { _ in },
        onCancel: { }
    )
}

#Preview("Treino livre") {
    ActiveRunView(
        workoutManager: WorkoutManager(),
        workout: nil,
        onFinish: { _ in },
        onCancel: { }
    )
}

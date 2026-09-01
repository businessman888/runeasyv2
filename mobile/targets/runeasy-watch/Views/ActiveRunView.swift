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
///       Rodando → mute opcional + pausar
///       Pausado → mute opcional + retomar + finalizar
struct ActiveRunView: View {
    private enum TrackingPage: Hashable {
        case metrics
        case map
        case health
    }

    @ObservedObject var workoutManager: WorkoutManager
    @EnvironmentObject private var phoneBridge: PhoneBridge
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.redactionReasons) private var redactionReasons
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    let workout: PlannedWorkout?
    let onFinish: (CompletedRun) -> Void
    let onCancel: () -> Void

    @State private var showStopConfirmation = false
    @State private var controlsArmed = false
    @State private var coachEnabled = true
    @State private var selectedTrackingPage: TrackingPage = .metrics

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

                if watchOwnsCoachAudio {
                    coachPreferenceButton
                }

                CircleIconButton(
                    icon: RunEasySymbol.start,
                    accessibilityLabel: "Iniciar treino",
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
                        .font(AppFont.labelReadable)
                        .foregroundColor(.runEasyText60)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Voltar para o início")

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

    private var coachPreferenceButton: some View {
        Button {
            coachEnabled.toggle()
            WKInterfaceDevice.current().play(.click)
        } label: {
            Label(
                coachEnabled ? "Coach ligado" : "Coach desligado",
                systemImage: coachEnabled
                    ? RunEasySymbol.coachEnabled
                    : RunEasySymbol.coachDisabled
            )
            .font(AppFont.labelReadable)
            .foregroundStyle(coachEnabled ? Color.runEasyCyan : .secondary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.runEasyCardBg, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Ativa ou silencia orientações por voz durante a corrida.")
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
        ZStack(alignment: .top) {
            TabView(selection: $selectedTrackingPage) {
                primaryMetricsPage
                    .tag(TrackingPage.metrics)
                if phoneBridge.featureFlags.liveMapEnabled {
                    LiveRouteMapView(
                        route: workoutManager.liveRoutePresentation,
                        locationState: workoutManager.liveRouteLocationState,
                        isActivePage: selectedTrackingPage == .map && scenePhase == .active
                    )
                    .tag(TrackingPage.map)
                }
                healthMetricsPage
                    .tag(TrackingPage.health)
            }
            .tabViewStyle(.verticalPage)

            if workoutManager.coachSessionIsAvailable
                && redactionReasons.isEmpty
                && !isLuminanceReduced {
                CoachCaptionOverlay(controller: workoutManager.coachController)
            }
        }
    }

    private var primaryMetricsPage: some View {
        VStack(spacing: 6) {
            timerSection
            metricsSection
            liveHeartRateStrip
            Spacer(minLength: 0)
            controlsSection
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var healthMetricsPage: some View {
        VStack(spacing: 8) {
            Text("Saúde ao vivo")
                .font(AppFont.labelReadable)
                .foregroundColor(.runEasyText60)

            VStack(spacing: 1) {
                Image(systemName: RunEasySymbol.heart)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.red)
                Text(currentHeartRateLabel)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(.runEasyTextPrimary)
                    .monospacedDigit()
                    .privacySensitive()
                Text(metrics.heartRate == nil ? "Aguardando leitura" : "batimentos por minuto")
                    .font(.system(size: 9))
                    .foregroundColor(.runEasyText60)
            }

            HStack(spacing: 6) {
                healthMetric(
                    icon: RunEasySymbol.maximumHeartRate,
                    label: "Máxima",
                    value: metrics.maxHeartRate > 0 ? "\(metrics.maxHeartRate) bpm" : "— bpm"
                )
                healthMetric(
                    icon: RunEasySymbol.activeEnergy,
                    label: "Calorias ativas",
                    value: metrics.calories > 0 ? "\(metrics.calories) kcal" : "— kcal"
                )
            }

            Text(metrics.isPaused ? "Treino pausado" : "Gire a coroa para voltar")
                .font(.system(size: 8))
                .foregroundColor(metrics.isPaused ? .runEasyWarning : .runEasyText60)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var currentHeartRateLabel: String {
        guard let heartRate = metrics.heartRate, heartRate > 0 else { return "—" }
        return "\(heartRate) bpm"
    }

    private func healthMetric(
        icon: String,
        label: String,
        value: String
    ) -> some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.runEasyCyan)
            Text(label)
                .font(.system(size: 8))
                .foregroundColor(.runEasyText60)
            Text(value)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundColor(.runEasyTextPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .privacySensitive()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .background(Color.runEasyCardBg)
        .cornerRadius(9)
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
                icon: RunEasySymbol.run,
                label: "Distância",
                value: "\(MetricFormat.distance(metrics.distanceMeters)) km"
            )
            metricBlock(
                icon: RunEasySymbol.pace,
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

    private var liveHeartRateStrip: some View {
        HStack(spacing: 5) {
            Image(systemName: RunEasySymbol.heart)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.red)
            Text("FC")
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(.runEasyText60)
            Text(currentHeartRateLabel)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(.runEasyTextPrimary)
                .monospacedDigit()
                .privacySensitive()
            Spacer(minLength: 0)
            Text(metrics.heartRate == nil ? "aguardando" : "ao vivo")
                .font(.system(size: 8))
                .foregroundColor(.runEasyText60)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(Color.runEasyCardBg)
        .cornerRadius(8)
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

    /// Rodando — mute opcional + ação primária de pausa.
    private var runningControls: some View {
        HStack(spacing: RunEasySpacing.large) {
            Spacer()
            if workoutManager.coachSessionIsAvailable {
                coachMuteButton
            }
            CircleIconButton(
                icon: RunEasySymbol.pause,
                accessibilityLabel: "Pausar treino",
                fillColor: .runEasyCyan,
                iconColor: .runEasyNavy,
                size: RunEasyControlSize.minimumTouch
            ) {
                togglePause()
            }
            Spacer()
        }
    }

    /// Pausado — mute opcional + retomar (outline) + finalizar (cyan).
    private var pausedControls: some View {
        HStack(spacing: RunEasySpacing.small) {
            if workoutManager.coachSessionIsAvailable {
                coachMuteButton
            }
            CircleIconButton(
                icon: RunEasySymbol.start,
                accessibilityLabel: "Retomar treino",
                fillColor: .runEasyCardBg,
                iconColor: .runEasyCyan,
                strokeColor: .runEasyCyan,
                strokeWidth: 1.5,
                size: RunEasyControlSize.minimumTouch
            ) {
                togglePause()
            }
            CircleIconButton(
                icon: RunEasySymbol.finish,
                accessibilityLabel: "Finalizar treino",
                fillColor: .runEasyCyan,
                iconColor: .runEasyNavy,
                size: RunEasyControlSize.minimumTouch
            ) {
                WKInterfaceDevice.current().play(.notification)
                showStopConfirmation = true
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var watchOwnsCoachAudio: Bool {
        phoneBridge.featureFlags.audioCoachEnabled
            && phoneBridge.coachPolicy?.version == 1
            && phoneBridge.coachPolicy?.audioOwner == .watch
    }

    private var coachMuteButton: some View {
        let muted = workoutManager.coachSessionIsMuted
        return CircleIconButton(
            icon: muted ? RunEasySymbol.coachDisabled : RunEasySymbol.coachEnabled,
            accessibilityLabel: muted ? "Ativar voz do coach" : "Silenciar voz do coach",
            fillColor: .runEasyCardBg,
            iconColor: muted ? .runEasyText60 : .runEasyCyan,
            strokeColor: muted ? .runEasyText60 : .runEasyCyan,
            strokeWidth: 1,
            size: RunEasyControlSize.minimumTouch
        ) {
            workoutManager.toggleCoachMuted()
        }
        .accessibilityHint("Altera apenas as orientações por voz deste treino.")
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
        workoutManager.configureCoach(
            enabled: watchOwnsCoachAudio && coachEnabled,
            audioOwner: phoneBridge.coachPolicy?.audioOwner ?? .none,
            policy: phoneBridge.coachPolicy?.runtimePolicy ?? .standard
        )
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

private struct CoachCaptionOverlay: View {
    @ObservedObject var controller: WatchCoachController

    var body: some View {
        if let caption = controller.caption {
            Label(caption, systemImage: RunEasySymbol.coachEnabled)
                .font(AppFont.labelReadable)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.top, 4)
                .padding(.horizontal, 12)
                .accessibilityElement(children: .combine)
                .privacySensitive()
        }
    }
}

// MARK: - CircleIconButton (componente local)

private struct CircleIconButton: View {
    let icon: String
    let accessibilityLabel: String
    let fillColor: Color
    let iconColor: Color
    var strokeColor: Color? = nil
    var strokeWidth: CGFloat = 0
    let size: CGFloat
    let action: () -> Void
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

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
            .neonGlow(
                color: fillColor == .runEasyCyan ? .runEasyCyan : .clear,
                radius: isLuminanceReduced ? 0 : 8,
                opacity: isLuminanceReduced ? 0 : 0.35
            )
        }
        .buttonStyle(PressScaleStyleLocal())
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(
            accessibilityLabel == "Finalizar treino"
                ? "Solicita confirmação antes de encerrar."
                : ""
        )
    }
}

private struct PressScaleStyleLocal: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(
                reduceMotion ? 1 : (configuration.isPressed ? 0.94 : 1.0)
            )
            .animation(
                reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.7),
                value: configuration.isPressed
            )
    }
}

#Preview("Treino do plano") {
    ActiveRunView(
        workoutManager: WorkoutManager(),
        workout: .mock,
        onFinish: { _ in },
        onCancel: { }
    )
    .environmentObject(PhoneBridge.shared)
}

#Preview("Treino livre") {
    ActiveRunView(
        workoutManager: WorkoutManager(),
        workout: nil,
        onFinish: { _ in },
        onCancel: { }
    )
    .environmentObject(PhoneBridge.shared)
}

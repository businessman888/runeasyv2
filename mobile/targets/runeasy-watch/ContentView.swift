import SwiftUI
import os

private let navLog = Logger(
    subsystem: "com.oytotec.runeasy.watchkitapp",
    category: "navigation"
)

private enum RunLaunch {
    case planned(workout: PlannedWorkout)
    case free

    var workout: PlannedWorkout? {
        switch self {
        case .planned(let workout): return workout
        case .free: return nil
        }
    }
}

/// Raiz do app.
///
/// Paginação vertical (AUDITORIA §P2): arrastar a tela inicial para cima abre
/// Resultados. É o idioma nativo do watchOS — o mesmo do app Treino da Apple.
///
/// O tracking é apresentado fora do pager. Assim uma sessão ativa não compete
/// com o gesto vertical nem é recriada quando o usuário muda de página.
struct ContentView: View {
    @EnvironmentObject private var phoneBridge: PhoneBridge

    /// O manager pertence à raiz estável. A tela de destino apenas o observa;
    /// assim o primeiro toque não cria/destroi objetos de workout junto com a
    /// transição do pager.
    @StateObject private var workoutManager = WorkoutManager()
    @State private var activeRun: RunLaunch?
    @State private var lastCompletedRun: CompletedRun?
    @State private var launchPending = false

    var body: some View {
        ZStack {
            // O pager permanece montado durante todo o ciclo. Removê-lo dentro
            // da action do próprio Button era o ponto comum aos dois crashes.
            homePages
                .opacity(isShowingHome ? 1 : 0)
                .allowsHitTesting(isShowingHome)
                .accessibilityHidden(!isShowingHome)

            if let activeRun {
                activeRunScreen(activeRun)
                    .zIndex(2)
            } else if let run = lastCompletedRun {
                summaryScreen(run)
                    .zIndex(1)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            WatchLaunchDiagnostics.beginAppSession()
            WatchLaunchDiagnostics.mark("workout-manager.ready")
        }
        .task {
            phoneBridge.activate()
        }
    }

    private var isShowingHome: Bool {
        activeRun == nil && lastCompletedRun == nil
    }

    // MARK: - Página 1 — Hoje

    private var homePages: some View {
        TabView {
            StartView(
                userName: phoneBridge.userName,
                avatarUrl: phoneBridge.avatarUrl,
                isPro: phoneBridge.isPro,
                hasReceivedContext: phoneBridge.hasReceivedContext,
                isReachable: phoneBridge.isReachable,
                syncState: phoneBridge.syncState,
                workout: phoneBridge.todayWorkout,
                weekStats: phoneBridge.weekStats,
                nextWorkout: phoneBridge.nextWorkout,
                pendingTransfers: phoneBridge.pendingTransfers,
                onStart: { workout in
                    // Este log separa "o toque não chega" de "o toque chega e a
                    // tela de destino trava" — ver AUDITORIA-apple-watch.md §3.5.
                    navLog.info("onStart tocado, workout=\(workout?.id ?? "free", privacy: .public) completed=\(workout?.isCompleted == true, privacy: .public)")
                    // Bloqueia se treino já completado (botão deveria estar disabled, mas por segurança)
                    if workout?.isCompleted == true { return }
                    if let workout {
                        WatchLaunchDiagnostics.mark("home.tap.planned")
                        scheduleLaunch(.planned(workout: workout))
                    } else {
                        navLog.error("onStart planejado recebido sem workout")
                    }
                },
                onStartFreeRun: {
                    // workoutId nil → o iPhone roteia para completeFreeRun.
                    navLog.info("onStartFreeRun tocado")
                    WatchLaunchDiagnostics.mark("home.tap.free")
                    scheduleLaunch(.free)
                },
                onUpgrade: {
                    // O Superwall não roda no watchOS: delega ao iPhone.
                    // Retorna false quando não alcançável, e o card mostra o
                    // fallback "Abra o RunEasy no iPhone".
                    let delivered = phoneBridge.requestOpenPaywall()
                    navLog.info("onUpgrade entregue=\(delivered, privacy: .public)")
                    return delivered
                },
                onRefresh: {
                    let delivered = phoneBridge.requestRefresh()
                    navLog.info("onRefresh entregue=\(delivered, privacy: .public)")
                    return delivered
                }
            )

            ResultsView(
                isPro: phoneBridge.isPro,
                activities: phoneBridge.todayActivities,
                planResult: phoneBridge.latestPlanResult,
                activityResult: phoneBridge.latestActivityResult
            )
        }
        .tabViewStyle(.verticalPage)
    }

    /// Separa a transição da transaction de pressão/haptic do botão. O pager
    /// continua existindo no ZStack e o destino entra somente no próximo turno
    /// do MainActor, sem animação estrutural implícita.
    private func scheduleLaunch(_ launch: RunLaunch) {
        guard !launchPending, activeRun == nil, lastCompletedRun == nil else { return }
        launchPending = true
        WatchLaunchDiagnostics.mark("launch.scheduled")

        Task { @MainActor in
            await Task.yield()
            guard activeRun == nil, lastCompletedRun == nil else {
                launchPending = false
                return
            }

            workoutManager.reset()
            WatchLaunchDiagnostics.mark("route.will-set")
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                activeRun = launch
                launchPending = false
            }
            WatchLaunchDiagnostics.mark("route.did-set")
            navLog.info("root estável → activeRun")
        }
    }

    private func activeRunScreen(_ launch: RunLaunch) -> some View {
        ActiveRunView(
            workoutManager: workoutManager,
            workout: launch.workout,
            onFinish: { run in
                lastCompletedRun = run
                phoneBridge.sendCompletedRun(run)
                activeRun = nil
            },
            onCancel: {
                workoutManager.reset()
                activeRun = nil
            }
        )
    }

    private func summaryScreen(_ run: CompletedRun) -> some View {
        RunSummaryView(
            run: run,
            pendingTransfers: phoneBridge.pendingTransfers,
            deliveryAck: phoneBridge.lastRunAck,
            onDone: {
                workoutManager.reset()
                lastCompletedRun = nil
            }
        )
    }

}

#Preview {
    ContentView()
        .environmentObject(PhoneBridge())
}

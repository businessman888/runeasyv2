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

    @State private var activeRun: RunLaunch?
    @State private var lastCompletedRun: CompletedRun?

    var body: some View {
        Group {
            if let activeRun {
                activeRunScreen(activeRun)
            } else if let run = lastCompletedRun {
                summaryScreen(run)
            } else {
                homePages
            }
        }
        .preferredColorScheme(.dark)
        .task {
            phoneBridge.activate()
        }
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
                        // Snapshot imutável: um applicationContext novo não
                        // pode transformar a tela já aberta em corrida livre.
                        activeRun = .planned(workout: workout)
                    }
                    navLog.info("root → activeRun planned")
                },
                onStartFreeRun: {
                    // workoutId nil → o iPhone roteia para completeFreeRun.
                    navLog.info("onStartFreeRun tocado")
                    activeRun = .free
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

    private func activeRunScreen(_ launch: RunLaunch) -> some View {
        NavigationStack {
            ActiveRunView(
                workout: launch.workout,
                onFinish: { run in
                    lastCompletedRun = run
                    phoneBridge.sendCompletedRun(run)
                    activeRun = nil
                },
                onCancel: { activeRun = nil }
            )
        }
    }

    private func summaryScreen(_ run: CompletedRun) -> some View {
        NavigationStack {
            RunSummaryView(
                run: run,
                pendingTransfers: phoneBridge.pendingTransfers,
                deliveryAck: phoneBridge.lastRunAck,
                onDone: { lastCompletedRun = nil }
            )
        }
    }

}

#Preview {
    ContentView()
        .environmentObject(PhoneBridge())
}

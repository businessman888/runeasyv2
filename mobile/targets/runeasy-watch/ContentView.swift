import SwiftUI
import os

private let navLog = Logger(
    subsystem: "com.oytotec.runeasy.watchkitapp",
    category: "navigation"
)

enum AppRoute: Hashable {
    case activeRun(workoutId: String?)
    case summary
}

/// Raiz do app.
///
/// Paginação vertical (AUDITORIA §P2): arrastar a tela inicial para cima abre
/// Resultados. É o idioma nativo do watchOS — o mesmo do app Treino da Apple.
///
/// A NavigationStack fica DENTRO da página 1, não envolvendo o TabView.
/// Envolver o TabView faria a barra de navegação aparecer nas duas páginas e
/// competiria com o gesto vertical de paginação.
struct ContentView: View {
    @EnvironmentObject private var phoneBridge: PhoneBridge

    @State private var path: [AppRoute] = []
    @State private var lastCompletedRun: CompletedRun?

    var body: some View {
        TabView {
            todayPage
            ResultsView(
                isPro: phoneBridge.isPro,
                activities: phoneBridge.todayActivities,
                planResult: phoneBridge.latestPlanResult,
                activityResult: phoneBridge.latestActivityResult
            )
        }
        .tabViewStyle(.verticalPage)
        .preferredColorScheme(.dark)
        .task {
            phoneBridge.activate()
        }
    }

    // MARK: - Página 1 — Hoje

    private var todayPage: some View {
        NavigationStack(path: $path) {
            StartView(
                userName: phoneBridge.userName,
                avatarUrl: phoneBridge.avatarUrl,
                isPro: phoneBridge.isPro,
                hasReceivedContext: phoneBridge.hasReceivedContext,
                isReachable: phoneBridge.isReachable,
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
                    path.append(.activeRun(workoutId: workout?.id))
                    navLog.info("path.append → activeRun (depth=\(path.count, privacy: .public))")
                },
                onStartFreeRun: {
                    // workoutId nil → o iPhone roteia para completeFreeRun.
                    navLog.info("onStartFreeRun tocado")
                    path.append(.activeRun(workoutId: nil))
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
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .activeRun(let workoutId):
                    ActiveRunView(
                        // Treino livre (workoutId nil) NÃO deve herdar o treino
                        // do plano do dia — senão a corrida seria creditada ao
                        // treino programado.
                        workout: workoutId == nil ? nil : phoneBridge.todayWorkout,
                        onFinish: { run in
                            lastCompletedRun = run
                            phoneBridge.sendCompletedRun(run)
                            path.append(.summary)
                        },
                        onCancel: {
                            if !path.isEmpty { path.removeLast() }
                        }
                    )
                case .summary:
                    if let run = lastCompletedRun {
                        RunSummaryView(
                            run: run,
                            pendingTransfers: phoneBridge.pendingTransfers,
                            onDone: {
                                // Limpar evita o resumo antigo reaparecer numa
                                // navegação seguinte antes do novo run chegar.
                                lastCompletedRun = nil
                                path.removeAll()
                            }
                        )
                    } else {
                        Text("Sem dados").onAppear { path.removeAll() }
                    }
                }
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(PhoneBridge())
}

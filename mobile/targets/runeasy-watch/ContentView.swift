import SwiftUI

enum AppRoute: Hashable {
    case activeRun(workoutId: String?)
    case summary
}

struct ContentView: View {
    @EnvironmentObject private var phoneBridge: PhoneBridge

    @State private var path: [AppRoute] = []
    @State private var lastCompletedRun: CompletedRun?

    var body: some View {
        NavigationStack(path: $path) {
            StartView(
                userName: phoneBridge.userName,
                avatarUrl: phoneBridge.avatarUrl,
                workout: phoneBridge.todayWorkout,
                weekStats: phoneBridge.weekStats,
                nextWorkout: phoneBridge.nextWorkout,
                onStart: { workout in
                    // Bloqueia se treino já completado (botão deveria estar disabled, mas por segurança)
                    if workout?.isCompleted == true { return }
                    path.append(.activeRun(workoutId: workout?.id))
                }
            )
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .activeRun:
                    ActiveRunView(
                        workout: phoneBridge.todayWorkout,
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
                            onDone: {
                                path.removeAll()
                            }
                        )
                    } else {
                        Text("Sem dados").onAppear { path.removeAll() }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task {
            phoneBridge.activate()
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(PhoneBridge())
}

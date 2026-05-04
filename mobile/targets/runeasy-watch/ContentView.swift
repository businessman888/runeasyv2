import SwiftUI

enum AppRoute: Hashable {
    case activeRun(workoutId: String?)
    case summary
}

struct ContentView: View {
    @EnvironmentObject private var phoneBridge: PhoneBridge

    @State private var path: [AppRoute] = []
    @State private var lastCompletedRun: CompletedRun?

    /// Fallback pra desenvolvimento: se o iPhone ainda não pareou e enviou um treino,
    /// mostra um treino mock pra UI ficar testável. Em produção, sem treino → tela de descanso.
    private var displayedWorkout: PlannedWorkout? {
        #if DEBUG
        return phoneBridge.todayWorkout ?? .mock
        #else
        return phoneBridge.todayWorkout
        #endif
    }

    var body: some View {
        NavigationStack(path: $path) {
            StartView(
                userName: phoneBridge.userName,
                workout: displayedWorkout,
                onStart: { workout in
                    path.append(.activeRun(workoutId: workout?.id))
                }
            )
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .activeRun:
                    ActiveRunView(
                        workout: displayedWorkout,
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
    }
}

#Preview {
    ContentView()
        .environmentObject(PhoneBridge())
}

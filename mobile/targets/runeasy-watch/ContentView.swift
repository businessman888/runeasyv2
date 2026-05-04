import SwiftUI

enum AppRoute: Hashable {
    case activeRun(workoutId: String?)
    case summary
}

struct ContentView: View {
    // Mock state — substituído por dados reais do iPhone via WatchConnectivity na Fase 4
    @State private var path: [AppRoute] = []
    @State private var userName: String = "Matheus"
    @State private var todayWorkout: PlannedWorkout? = .mock
    @State private var lastCompletedRun: CompletedRun?

    var body: some View {
        NavigationStack(path: $path) {
            StartView(
                userName: userName,
                workout: todayWorkout,
                onStart: { workout in
                    path.append(.activeRun(workoutId: workout?.id))
                }
            )
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .activeRun:
                    ActiveRunView(
                        workout: todayWorkout,
                        onFinish: { run in
                            lastCompletedRun = run
                            path.append(.summary)
                            // TODO Fase 4: enviar `run` para o iPhone via WatchConnectivity aqui
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
                        // Fallback defensivo — não deveria chegar aqui
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
}

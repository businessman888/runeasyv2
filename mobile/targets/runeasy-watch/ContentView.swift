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
    @State private var lastFinishedMetrics: RunMetrics = RunMetrics()

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
                        onFinish: { metrics in
                            lastFinishedMetrics = metrics
                            path.append(.summary)
                        },
                        onCancel: {
                            path.removeLast()
                        }
                    )
                case .summary:
                    RunSummaryView(
                        metrics: lastFinishedMetrics,
                        onDone: {
                            path.removeAll()
                        }
                    )
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
}

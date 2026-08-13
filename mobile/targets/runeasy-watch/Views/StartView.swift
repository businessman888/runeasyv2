import SwiftUI

/// Página 1 do app — espelha a Home do app mobile (Figma 1058-1239 / 1109-1239).
///
/// Ramificação de 3 vias (AUDITORIA §P1). Antes eram 2, e o Free caía no mesmo
/// RestDayCard de um Pro em dia de descanso:
///
///   !isPro                 → UpgradeProCard   (Free: sem plano)
///   isPro + treino hoje    → WorkoutDayCard
///   isPro + descanso       → RestDayCard
///
/// O FreeRunCard aparece nos TRÊS casos — corrida livre é gratuita em qualquer
/// plano, e era a ausência dele que deixava o dia de descanso sem nenhuma ação.
struct StartView: View {
    let userName: String
    let avatarUrl: String?
    let isPro: Bool
    /// Já recebemos ao menos um contexto do iPhone? Enquanto false, tratamos o
    /// usuário como Pro — mostrar card de upgrade a um assinante por falta de
    /// sync seria pior do que o inverso.
    let hasReceivedContext: Bool
    let isReachable: Bool
    let syncState: WatchSyncState
    let workout: PlannedWorkout?
    let weekStats: WeekStats
    let nextWorkout: NextWorkoutInfo?
    let pendingTransfers: Int
    let onStart: (PlannedWorkout?) -> Void
    let onStartFreeRun: () -> Void
    /// Retorna false quando o pedido não pôde ser entregue ao iPhone.
    let onUpgrade: () -> Bool
    /// Pede contexto fresco ao iPhone. False = não entregue.
    let onRefresh: () -> Bool

    private var showUpgrade: Bool { hasReceivedContext && !isPro }
    private var hasPlanWorkout: Bool {
        guard let workout else { return false }
        return workout.type != .rest
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HeaderView(userName: userName, avatarUrl: avatarUrl, stats: weekStats)
                    .padding(.bottom, 2)

                ConnectivityBanner(
                    isReachable: isReachable,
                    hasReceivedContext: hasReceivedContext,
                    syncState: syncState,
                    pendingTransfers: pendingTransfers,
                    onRefresh: onRefresh
                )

                Text("Seus treinos")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.runEasyTextPrimary)
                    .padding(.horizontal, 2)

                if showUpgrade {
                    UpgradeProCard(isReachable: isReachable, onUpgrade: onUpgrade)
                } else if hasPlanWorkout, let workout {
                    WorkoutDayCard(workout: workout) {
                        onStart(workout)
                    }
                } else {
                    RestDayCard(nextWorkout: nextWorkout)
                }

                // Sempre disponível. `isSecondary` só quando há uma ação
                // principal concorrendo pela atenção.
                FreeRunCard(isSecondary: hasPlanWorkout && !showUpgrade) {
                    onStartFreeRun()
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)
        }
        .background(Color.runEasyNavy.ignoresSafeArea())
    }
}

// MARK: - Previews

private func previewStart(
    isPro: Bool = true,
    workout: PlannedWorkout? = nil,
    nextWorkout: NextWorkoutInfo? = nil,
    isReachable: Bool = true,
    pendingTransfers: Int = 0
) -> some View {
    StartView(
        userName: "Matheus",
        avatarUrl: nil,
        isPro: isPro,
        hasReceivedContext: true,
        isReachable: isReachable,
        syncState: .synced,
        workout: workout,
        weekStats: .mock,
        nextWorkout: nextWorkout,
        pendingTransfers: pendingTransfers,
        onStart: { _ in },
        onStartFreeRun: {},
        onUpgrade: { true },
        onRefresh: { true }
    )
}

#Preview("Pro — dia de treino") {
    previewStart(workout: .mock)
}

#Preview("Pro — treino concluído") {
    var w = PlannedWorkout.mock
    w.status = .completed
    return previewStart(workout: w)
}

#Preview("Pro — dia de descanso") {
    previewStart(nextWorkout: .mock)
}

#Preview("Free — upgrade") {
    previewStart(isPro: false, nextWorkout: .mock)
}

#Preview("Free — iPhone fora de alcance") {
    previewStart(isPro: false, nextWorkout: .mock, isReachable: false)
}

#Preview("Corrida pendente de envio") {
    previewStart(workout: .mock, pendingTransfers: 1)
}

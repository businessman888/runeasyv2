import SwiftUI

/// Página 2 — Resultados. Alcançada arrastando a tela inicial para cima
/// (AUDITORIA §P2/§P6).
///
/// Replica o comportamento do par "Treinos | Atividades" da Home do app mobile,
/// mas NÃO replica o controle: o SegmentedTabs do mobile é horizontal de duas
/// abas e, em 40mm (~162pt úteis), cada segmento ficaria abaixo do alvo mínimo
/// de toque de 44pt da Apple. Usamos `.pickerStyle(.navigationLink)`, que é o
/// idioma nativo do watchOS e funciona com a coroa digital.
struct ResultsView: View {
    let isPro: Bool
    let activities: [ActivityForWatch]
    let planResult: RunResultForWatch?
    let activityResult: RunResultForWatch?

    enum Scope: String, CaseIterable, Identifiable {
        case plan
        case activity

        var id: String { rawValue }
        var label: String {
            switch self {
            case .plan:     return "Treinos"
            case .activity: return "Atividades"
            }
        }
    }

    /// Espelha o `workoutScopeStore` do mobile (persistido, default 'plan').
    @AppStorage("workout_scope_tab") private var storedScope: String = Scope.plan.rawValue

    private var scope: Binding<Scope> {
        Binding(
            get: { Scope(rawValue: storedScope) ?? .plan },
            set: { storedScope = $0.rawValue }
        )
    }

    var body: some View {
        // NavigationStack própria desta página. `.pickerStyle(.navigationLink)`
        // empurra uma tela de seleção e precisa de um container de navegação —
        // sem ele o Picker renderiza mas não navega. Cada página do TabView ter
        // sua própria stack é o padrão no watchOS; o que NÃO se pode fazer é
        // envolver o TabView inteiro (quebraria o gesto de paginação vertical).
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Picker("Ver", selection: scope) {
                        ForEach(Scope.allCases) { s in
                            Text(s.label).tag(s)
                        }
                    }
                    .pickerStyle(.navigationLink)

                    switch scope.wrappedValue {
                    case .plan:     planSection
                    case .activity: activitySection
                    }
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 4)
            }
            .background(Color.runEasyNavy.ignoresSafeArea())
            .navigationTitle("Resultados")
        }
    }

    // MARK: - Treinos do plano

    @ViewBuilder
    private var planSection: some View {
        if !isPro {
            // Paridade com o mobile: o Free NUNCA vê resultado de treino do
            // plano, nem com plan-activity órfã. O gate real é no iPhone (que
            // não envia planResult para Free); isto é a segunda barreira.
            EmptyStateCard(
                icon: "lock.fill",
                title: "Exclusivo do Coach AI",
                subtitle: "Torne-se Pro para acompanhar seus treinos do plano."
            )
        } else if let planResult {
            ResultCard(result: planResult)
        } else {
            EmptyStateCard(
                icon: "chart.bar.xaxis",
                title: "Nenhum resultado ainda",
                subtitle: "Os resumos das suas corridas aparecem aqui após você treinar."
            )
        }
    }

    // MARK: - Atividades avulsas

    @ViewBuilder
    private var activitySection: some View {
        if activities.isEmpty {
            EmptyStateCard(
                icon: "figure.walk",
                title: "Nenhuma atividade hoje",
                subtitle: "Suas corridas livres e treinos manuais do dia aparecem aqui."
            )
        } else {
            ForEach(activities) { activity in
                ActivityCard(activity: activity)
            }
        }

        if let activityResult {
            Text("Último resultado")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.runEasyText60)
                .padding(.top, 2)
            ResultCard(result: activityResult)
        }
    }
}

#Preview("Pro — com dados") {
    ResultsView(
        isPro: true,
        activities: [.mockFree, .mockManual],
        planResult: .mockPlan,
        activityResult: .mockActivity
    )
}

#Preview("Pro — vazio") {
    ResultsView(isPro: true, activities: [], planResult: nil, activityResult: nil)
}

#Preview("Free") {
    ResultsView(isPro: false, activities: [.mockFree], planResult: nil, activityResult: .mockActivity)
}

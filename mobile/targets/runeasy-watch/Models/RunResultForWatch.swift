import Foundation

/// Resumo da última corrida concluída de um escopo (plano ou atividade avulsa).
/// Espelha `RunResultForWatch` em mobile/src/services/appleWatch.ts.
///
/// Deliberadamente SEM rota e SEM textos de feedback do Coach: rota estouraria
/// o limite do applicationContext e a análise não é renderizável no relógio.
/// Sem CodingKeys — payload em camelCase (ver WeekStats.swift).
struct RunResultForWatch: Codable, Equatable {
    let activityId: String
    let scope: Scope
    let title: String
    /// "12/08" — já formatado pelo iPhone.
    let dateLabel: String
    let distanceKm: Double
    let durationSeconds: Int
    /// "5:42"
    let pace: String
    var avgHeartRate: Int?

    enum Scope: String, Codable {
        case plan
        case activity
    }
}

extension RunResultForWatch {
    static let mockPlan = RunResultForWatch(
        activityId: "res-plan-001",
        scope: .plan,
        title: "Rodagem Leve",
        dateLabel: "12/08",
        distanceKm: 5.2,
        durationSeconds: 1694,
        pace: "5:26",
        avgHeartRate: 148
    )

    static let mockActivity = RunResultForWatch(
        activityId: "res-act-001",
        scope: .activity,
        title: "Corrida Livre",
        dateLabel: "11/08",
        distanceKm: 3.4,
        durationSeconds: 1140,
        pace: "5:35",
        avgHeartRate: nil
    )
}

import Foundation

/// Stats da semana corrente exibidos no header da StartView (Figma: avatar + 3 pills).
/// Computado no iPhone (`useWatchSync`) a partir de `gamificationStore.stats` +
/// `trainingStore.schedule`. Watch só renderiza.
struct WeekStats: Codable, Equatable {
    /// Sequência atual (dias seguidos com treino concluído)
    let streak: Int
    /// Treinos concluídos na semana / total da semana
    let workoutsDone: Int
    let workoutsTotal: Int
    /// Dias de descanso já passados / total da semana
    let restDone: Int
    let restTotal: Int

    enum CodingKeys: String, CodingKey {
        case streak
        case workoutsDone   = "workouts_done"
        case workoutsTotal  = "workouts_total"
        case restDone       = "rest_done"
        case restTotal      = "rest_total"
    }
}

extension WeekStats {
    static let zero = WeekStats(streak: 0, workoutsDone: 0, workoutsTotal: 0, restDone: 0, restTotal: 0)
    static let mock = WeekStats(streak: 2, workoutsDone: 2, workoutsTotal: 2, restDone: 1, restTotal: 5)
}

/// Próximo treino programado (mostrado no card de descanso da StartView).
struct NextWorkoutInfo: Codable, Equatable {
    let title: String
    /// "yyyy-MM-dd" (ISO date) — Watch formata pra display ("domingo, 5 de abr.")
    let date: String
}

extension NextWorkoutInfo {
    static let mock = NextWorkoutInfo(title: "Longão", date: "2026-05-10")
}

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

    // NÃO adicionar CodingKeys em snake_case aqui. Este payload vem do iPhone
    // em camelCase (useWatchSync.ts → computeWeekStats) e nunca toca o backend
    // — ao contrário de CompletedRun, que vai direto pros DTOs do Nest e por
    // isso usa snake_case. Um CodingKeys snake_case aqui fazia o decode da
    // struct inteira falhar (keyNotFound), zerando os 3 pills do header.
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

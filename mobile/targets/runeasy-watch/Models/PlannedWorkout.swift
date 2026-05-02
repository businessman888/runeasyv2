import Foundation

struct PlannedWorkout: Codable, Identifiable, Equatable {
    let id: String
    let type: WorkoutType
    let title: String
    let distanceKm: Double
    let targetPace: String
    let instructions: String

    enum WorkoutType: String, Codable {
        case rodagem
        case longao
        case intervalado
        case tiros
        case rest

        var displayName: String {
            switch self {
            case .rodagem:     return "Rodagem"
            case .longao:      return "Longão"
            case .intervalado: return "Intervalado"
            case .tiros:       return "Tiros"
            case .rest:        return "Descanso"
            }
        }
    }
}

extension PlannedWorkout {
    static let mock = PlannedWorkout(
        id: "mock-workout-001",
        type: .rodagem,
        title: "Rodagem Leve",
        distanceKm: 4.5,
        targetPace: "6:00",
        instructions: "Mantenha pace confortável. Foque em respirar pelo nariz."
    )
}

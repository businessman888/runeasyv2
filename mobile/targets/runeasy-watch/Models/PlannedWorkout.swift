import Foundation

struct PlannedWorkout: Codable, Identifiable, Equatable {
    let id: String
    let type: WorkoutType
    let title: String
    let distanceKm: Double
    let targetPace: String
    let instructions: String
    /// 'pending' ou 'completed'. Quando ausente do payload do iPhone, default 'pending'.
    /// Quando 'completed', o botão Iniciar fica desabilitado (espelha o app mobile).
    var status: Status?
    /// Duração-alvo em segundos pra mostrar "Tempo: 51:35" no card
    var targetDurationSeconds: Int?
    /// "Moderada" | "Leve" | "Alta" — subtítulo do card
    var intensity: String?
    /// "Hoje, 14/06" — header pequeno do card (formatado pelo iPhone)
    var dateLabel: String?

    enum Status: String, Codable {
        case pending
        case completed
    }

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

    var isCompleted: Bool { status == .completed }
}

extension PlannedWorkout {
    static let mock = PlannedWorkout(
        id: "mock-workout-001",
        type: .longao,
        title: "Longão - 6km",
        distanceKm: 6.0,
        targetPace: "6:00",
        instructions: "Mantenha pace confortável.",
        status: .pending,
        targetDurationSeconds: 36 * 60,
        intensity: "Moderada",
        dateLabel: "Hoje, 14/06"
    )
}

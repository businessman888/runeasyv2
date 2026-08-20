import Foundation

// Payload final enviado do Watch ao iPhone via WatchConnectivity (Phase 4).
// Os nomes em snake_case batem com os DTOs do backend (workout-tracking.dto.ts).
struct CompletedRun: Codable, Equatable, Sendable {
    let runId: String                  // UUID imutável para dedup e ACK ponta a ponta
    let workoutId: String?              // UUID do treino do plano, nil para corrida livre
    let totalDistanceMeters: Double
    let durationSeconds: Int
    let avgPaceSecondsPerKm: Double
    let avgHeartRate: Int?
    let maxHeartRate: Int?
    let calories: Int?
    let routePoints: [RoutePoint]
    let startedAt: String               // ISO 8601
    let source: String                  // "apple_watch" sempre
    /// Resultado local da persistência no HealthKit. A corrida ainda pode ser
    /// enviada ao iPhone quando false, mas a UI não deve alegar sucesso total.
    let healthKitSaved: Bool
    let routeSaved: Bool
    let completionWarning: String?

    enum CodingKeys: String, CodingKey {
        case runId                = "run_id"
        case workoutId             = "workout_id"
        case totalDistanceMeters   = "total_distance_meters"
        case durationSeconds       = "duration_seconds"
        case avgPaceSecondsPerKm   = "avg_pace_seconds_per_km"
        case avgHeartRate          = "avg_heart_rate"
        case maxHeartRate          = "max_heart_rate"
        case calories
        case routePoints           = "route_points"
        case startedAt             = "started_at"
        case source
        case healthKitSaved        = "healthkit_saved"
        case routeSaved            = "route_saved"
        case completionWarning     = "completion_warning"
    }
}

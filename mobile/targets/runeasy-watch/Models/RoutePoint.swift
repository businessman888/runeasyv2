import Foundation
import CoreLocation

// Espelha exatamente runeasyv2/mobile/src/stores/trainingStore.ts:10-17
// para que o payload caia direto na fila offline existente do iPhone (MMKV).
struct RoutePoint: Codable, Equatable {
    let latitude: Double
    let longitude: Double
    let altitude: Double?     // null no JSON quando indisponível
    let timestamp: Double     // Unix epoch milliseconds (Date().timeIntervalSince1970 * 1000)
    let speed: Double?        // m/s
    let accuracy: Double?     // metros (horizontal accuracy)

    init(from location: CLLocation) {
        self.latitude  = location.coordinate.latitude
        self.longitude = location.coordinate.longitude
        // CLLocation.altitude é Double sempre — só inclui se verticalAccuracy >= 0
        self.altitude  = location.verticalAccuracy >= 0 ? location.altitude : nil
        self.timestamp = location.timestamp.timeIntervalSince1970 * 1000.0
        self.speed     = location.speed >= 0 ? location.speed : nil
        self.accuracy  = location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil
    }
}

import Foundation

/// Atividade avulsa do dia — corrida livre ou treino manual.
/// Espelha `ActivityForWatch` em mobile/src/services/appleWatch.ts.
///
/// NÃO tem CodingKeys: o payload vem do iPhone em camelCase e nunca toca o
/// backend. Ver o comentário em WeekStats.swift — foi exatamente esse engano
/// que zerou os pills do header por meses.
struct ActivityForWatch: Codable, Identifiable, Equatable {
    let id: String
    let source: Source
    let title: String
    let status: Status
    let distanceKm: Double
    /// Segundos. Ausente enquanto a atividade está pendente.
    var durationSeconds: Int?
    /// "6:00" — já formatado pelo iPhone.
    var pace: String?

    enum Source: String, Codable {
        case free
        case manual

        /// SF Symbol correspondente (espelha os ícones da aba Atividades da Home).
        var icon: String {
            switch self {
            case .free:   return "figure.run"
            case .manual: return "square.and.pencil"
            }
        }
    }

    enum Status: String, Codable {
        case pending
        case completed
    }

    var isCompleted: Bool { status == .completed }

    /// "5.2 km · 28:14 · 6:00/km" — linha única do card compacto.
    var summaryLine: String {
        var parts: [String] = ["\(MetricFormat.km(distanceKm)) km"]
        if let durationSeconds, durationSeconds > 0 {
            parts.append(MetricFormat.time(durationSeconds))
        }
        if let pace, !pace.isEmpty {
            parts.append("\(pace)/km")
        }
        return parts.joined(separator: " · ")
    }
}

extension ActivityForWatch {
    static let mockFree = ActivityForWatch(
        id: "act-free-001",
        source: .free,
        title: "Corrida Livre",
        status: .completed,
        distanceKm: 5.2,
        durationSeconds: 1694,
        pace: "5:26"
    )

    static let mockManual = ActivityForWatch(
        id: "act-manual-001",
        source: .manual,
        title: "Treino Manual",
        status: .pending,
        distanceKm: 8.0,
        durationSeconds: nil,
        pace: nil
    )
}

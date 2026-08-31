import Foundation

enum LiveRouteLocationState: Equatable {
    case seeking
    case active(horizontalAccuracy: Double, lastUpdatedAt: Date)
    case reducedAccuracy(horizontalAccuracy: Double?, lastUpdatedAt: Date?)
    case denied
    case unavailable
    case paused(horizontalAccuracy: Double?, lastUpdatedAt: Date?)
}

struct LiveRouteSegment: Identifiable, Equatable {
    let id: Int
    let points: [RoutePoint]
}

struct LiveRoutePresentation: Equatable {
    static let empty = LiveRoutePresentation(segments: [], revision: 0)

    let segments: [LiveRouteSegment]
    let revision: Int

    var pointCount: Int {
        segments.reduce(0) { $0 + $1.points.count }
    }

    var latestPoint: RoutePoint? {
        segments.last?.points.last
    }

    static func make(
        from rawSegments: [[RoutePoint]],
        revision: Int,
        maximumPointCount: Int = 240
    ) -> LiveRoutePresentation {
        let nonEmpty = rawSegments.filter { !$0.isEmpty }
        guard !nonEmpty.isEmpty, maximumPointCount > 0 else {
            return LiveRoutePresentation(segments: [], revision: revision)
        }

        // Há pelo menos um ponto reservado por segmento. Se um treino tiver
        // mais pausas que o orçamento visual, preservamos os segmentos mais
        // recentes. O payload integral continua separado no WorkoutManager.
        let selectedSegments = Array(nonEmpty.suffix(maximumPointCount))
        let targetCount = min(
            maximumPointCount,
            selectedSegments.reduce(0) { $0 + $1.count }
        )
        let pointLimits = allocatePointLimits(
            for: selectedSegments,
            targetCount: targetCount
        )
        let segments = zip(selectedSegments, pointLimits).enumerated().map {
            index, pair in
            let (points, pointLimit) = pair
            return LiveRouteSegment(
                id: index,
                points: downsample(points, limit: pointLimit)
            )
        }
        return LiveRoutePresentation(segments: segments, revision: revision)
    }

    /// Distribui exatamente o orçamento entre segmentos, sem ultrapassar o
    /// limite mesmo em treinos com muitas pausas.
    private static func allocatePointLimits(
        for segments: [[RoutePoint]],
        targetCount: Int
    ) -> [Int] {
        guard !segments.isEmpty, targetCount > 0 else { return [] }

        var limits = Array(repeating: 1, count: segments.count)
        var remaining = targetCount - segments.count
        guard remaining > 0 else { return limits }

        let additionalCapacity = segments.map { max(0, $0.count - 1) }
        let totalAdditionalCapacity = additionalCapacity.reduce(0, +)
        guard totalAdditionalCapacity > 0 else { return limits }

        for index in segments.indices {
            let proportional = Int(
                floor(
                    Double(additionalCapacity[index])
                        / Double(totalAdditionalCapacity)
                        * Double(remaining)
                )
            )
            let allocated = min(additionalCapacity[index], proportional)
            limits[index] += allocated
        }

        remaining = targetCount - limits.reduce(0, +)
        while remaining > 0 {
            guard let index = segments.indices.max(by: {
                (segments[$0].count - limits[$0])
                    < (segments[$1].count - limits[$1])
            }), limits[index] < segments[index].count else {
                break
            }
            limits[index] += 1
            remaining -= 1
        }
        return limits
    }

    private static func downsample(_ points: [RoutePoint], limit: Int) -> [RoutePoint] {
        guard limit > 0 else { return [] }
        guard points.count > limit else { return points }
        guard limit > 1 else { return [points[points.count - 1]] }
        let lastIndex = points.count - 1
        return (0..<limit).map { outputIndex in
            let ratio = Double(outputIndex) / Double(limit - 1)
            return points[Int((ratio * Double(lastIndex)).rounded())]
        }
    }
}

import Foundation

struct ActiveWorkoutContext: Codable, Sendable {
    let runId: String
    let workoutId: String?
    let startDate: Date
    let coachEnabled: Bool?
    let coachConfiguration: WatchCoachSessionConfiguration?
}

struct ActiveWorkoutSnapshot: Sendable {
    let context: ActiveWorkoutContext?
    let routePoints: [RoutePoint]
    let routeSegments: [[RoutePoint]]
}

/// Journal mínimo da sessão ativa. Os pontos ficam fora de UserDefaults para
/// não transformar preferências em um banco de milhares de coordenadas.
actor ActiveWorkoutCheckpointStore {
    private let fileManager = FileManager.default
    private let directoryURL: URL
    private let contextURL: URL
    private let routeURL: URL
    private let routeSegmentsURL: URL
    private let pendingCompletedURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var didPrepareStorage = false

    init() {
        let baseURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        directoryURL = baseURL.appendingPathComponent("RunEasyActiveWorkout", isDirectory: true)
        contextURL = directoryURL.appendingPathComponent("context.json")
        routeURL = directoryURL.appendingPathComponent("route.ndjson")
        routeSegmentsURL = directoryURL.appendingPathComponent("route-segments.json")
        pendingCompletedURL = baseURL.appendingPathComponent("RunEasyPendingCompletedRun.json")
    }

    func begin(_ context: ActiveWorkoutContext) throws {
        try ensureDirectory()
        try writeProtected(encoder.encode(context), to: contextURL)
        try writeProtected(Data(), to: routeURL)
        try writeProtected(encoder.encode([0]), to: routeSegmentsURL)
    }

    func updateContextPreservingRoute(_ context: ActiveWorkoutContext) throws {
        try ensureDirectory()
        try writeProtected(encoder.encode(context), to: contextURL)
    }

    func appendRoutePoints(_ points: [RoutePoint]) throws {
        guard !points.isEmpty else { return }
        try ensureDirectory()

        var line = try encoder.encode(points)
        line.append(0x0A)
        if !fileManager.fileExists(atPath: routeURL.path) {
            try writeProtected(line, to: routeURL)
            return
        }

        let handle = try FileHandle(forWritingTo: routeURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: line)
        try handle.synchronize()
    }

    /// Persiste somente os offsets que iniciam um novo trecho. O journal de
    /// coordenadas continua plano e retrocompatível com builds anteriores.
    func recordSegmentBoundary(pointIndex: Int) throws {
        guard pointIndex > 0 else { return }
        try ensureDirectory()
        var boundaries = loadSegmentBoundaries()
        guard !boundaries.contains(pointIndex) else { return }
        boundaries.append(pointIndex)
        boundaries.sort()
        try writeProtected(encoder.encode(boundaries), to: routeSegmentsURL)
    }

    func load() -> ActiveWorkoutSnapshot {
        let context = (try? Data(contentsOf: contextURL)).flatMap {
            try? decoder.decode(ActiveWorkoutContext.self, from: $0)
        }

        guard let data = try? Data(contentsOf: routeURL) else {
            return ActiveWorkoutSnapshot(
                context: context,
                routePoints: [],
                routeSegments: []
            )
        }

        let points = data.split(separator: 0x0A).flatMap { line -> [RoutePoint] in
            (try? decoder.decode([RoutePoint].self, from: Data(line))) ?? []
        }
        let segments = buildSegments(
            points: points,
            boundaries: loadSegmentBoundaries()
        )
        return ActiveWorkoutSnapshot(
            context: context,
            routePoints: points,
            routeSegments: segments
        )
    }

    func savePendingCompletedRun(_ run: CompletedRun) throws {
        try ensureDirectory()
        try writeProtected(encoder.encode(run), to: pendingCompletedURL)
        try excludeFromBackup(pendingCompletedURL)
    }

    func loadPendingCompletedRun() -> CompletedRun? {
        guard let data = try? Data(contentsOf: pendingCompletedURL) else { return nil }
        return try? decoder.decode(CompletedRun.self, from: data)
    }

    func clearPendingCompletedRun(runId: String) {
        guard let run = loadPendingCompletedRun(), run.runId == runId else { return }
        try? fileManager.removeItem(at: pendingCompletedURL)
    }

    func clear() {
        try? fileManager.removeItem(at: directoryURL)
        didPrepareStorage = false
    }

    private func ensureDirectory() throws {
        guard !didPrepareStorage else { return }
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directoryURL.path
        )
        var resourceURL = directoryURL
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try resourceURL.setResourceValues(values)
        didPrepareStorage = true
    }

    private func writeProtected(_ data: Data, to url: URL) throws {
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
    }

    private func excludeFromBackup(_ url: URL) throws {
        var resourceURL = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try resourceURL.setResourceValues(values)
    }

    private func loadSegmentBoundaries() -> [Int] {
        guard let data = try? Data(contentsOf: routeSegmentsURL),
              let decoded = try? decoder.decode([Int].self, from: data) else {
            // Build 1.0.8 não possuía esse sidecar. Um único trecho evita
            // interpretar cada lote NDJSON antigo como uma pausa.
            return [0]
        }
        return Array(Set(decoded.filter { $0 >= 0 })).sorted()
    }

    private func buildSegments(
        points: [RoutePoint],
        boundaries: [Int]
    ) -> [[RoutePoint]] {
        guard !points.isEmpty else { return [] }
        let starts = Array(
            Set([0] + boundaries.filter { $0 > 0 && $0 < points.count })
        ).sorted()

        return starts.enumerated().compactMap { offset, start in
            let end = offset + 1 < starts.count ? starts[offset + 1] : points.count
            guard start < end else { return nil }
            return Array(points[start..<end])
        }
    }
}

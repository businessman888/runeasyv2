import Foundation

struct ActiveWorkoutContext: Codable, Sendable {
    let runId: String
    let workoutId: String?
    let startDate: Date
}

struct ActiveWorkoutSnapshot: Sendable {
    let context: ActiveWorkoutContext?
    let routePoints: [RoutePoint]
}

/// Journal mínimo da sessão ativa. Os pontos ficam fora de UserDefaults para
/// não transformar preferências em um banco de milhares de coordenadas.
actor ActiveWorkoutCheckpointStore {
    private let fileManager = FileManager.default
    private let directoryURL: URL
    private let contextURL: URL
    private let routeURL: URL
    private let pendingCompletedURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        let baseURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        directoryURL = baseURL.appendingPathComponent("RunEasyActiveWorkout", isDirectory: true)
        contextURL = directoryURL.appendingPathComponent("context.json")
        routeURL = directoryURL.appendingPathComponent("route.ndjson")
        pendingCompletedURL = baseURL.appendingPathComponent("RunEasyPendingCompletedRun.json")
    }

    func begin(_ context: ActiveWorkoutContext) throws {
        try ensureDirectory()
        try encoder.encode(context).write(to: contextURL, options: .atomic)
        try Data().write(to: routeURL, options: .atomic)
    }

    func updateContextPreservingRoute(_ context: ActiveWorkoutContext) throws {
        try ensureDirectory()
        try encoder.encode(context).write(to: contextURL, options: .atomic)
    }

    func appendRoutePoints(_ points: [RoutePoint]) throws {
        guard !points.isEmpty else { return }
        try ensureDirectory()

        var line = try encoder.encode(points)
        line.append(0x0A)
        if !fileManager.fileExists(atPath: routeURL.path) {
            try line.write(to: routeURL, options: .atomic)
            return
        }

        let handle = try FileHandle(forWritingTo: routeURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: line)
    }

    func load() -> ActiveWorkoutSnapshot {
        let context = (try? Data(contentsOf: contextURL)).flatMap {
            try? decoder.decode(ActiveWorkoutContext.self, from: $0)
        }

        guard let data = try? Data(contentsOf: routeURL) else {
            return ActiveWorkoutSnapshot(context: context, routePoints: [])
        }

        let points = data.split(separator: 0x0A).flatMap { line -> [RoutePoint] in
            (try? decoder.decode([RoutePoint].self, from: Data(line))) ?? []
        }
        return ActiveWorkoutSnapshot(context: context, routePoints: points)
    }

    func savePendingCompletedRun(_ run: CompletedRun) throws {
        try ensureDirectory()
        try encoder.encode(run).write(to: pendingCompletedURL, options: .atomic)
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
    }

    private func ensureDirectory() throws {
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
    }
}

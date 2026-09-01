import CoreLocation
import Foundation
import HealthKit

@MainActor
final class WorkoutRouteRecorder {
    struct DrainResult {
        let acceptedPointCount: Int
        let insertedPointCount: Int
        let rejectedPointCount: Int
        let insertionError: String?
        let journalError: String?
        let timedOut: Bool
        let mayContainPreexistingRouteData: Bool

        var hasRouteData: Bool { insertedPointCount > 0 || mayContainPreexistingRouteData }
        var isComplete: Bool {
            !timedOut
                && insertionError == nil
                && rejectedPointCount == 0
                && insertedPointCount == acceptedPointCount
        }
    }

    private struct DrainWaiter {
        let continuation: CheckedContinuation<DrainResult, Never>
    }

    private let checkpointStore: ActiveWorkoutCheckpointStore
    private var routeBuilder: HKWorkoutRouteBuilder?
    private var generation = UUID()
    private var tail: Task<Void, Never>?
    private var accepting = false
    private var pendingOperationCount = 0
    private var acceptedPointCount = 0
    private var insertedPointCount = 0
    private var rejectedPointCount = 0
    private var insertionError: String?
    private var journalError: String?
    private var mayContainPreexistingRouteData = false
    private var waiters: [UUID: DrainWaiter] = [:]

    init(checkpointStore: ActiveWorkoutCheckpointStore) {
        self.checkpointStore = checkpointStore
    }

    func open(
        routeBuilder: HKWorkoutRouteBuilder?,
        mayContainPreexistingRouteData: Bool = false
    ) {
        invalidate()
        self.routeBuilder = routeBuilder
        self.mayContainPreexistingRouteData = mayContainPreexistingRouteData
        accepting = true
    }

    func enqueue(locations: [CLLocation], points: [RoutePoint]) {
        guard accepting, !locations.isEmpty, locations.count == points.count else {
            rejectedPointCount += points.count
            return
        }

        acceptedPointCount += points.count
        pendingOperationCount += 1

        let operationGeneration = generation
        let previous = tail
        let builder = routeBuilder
        let store = checkpointStore

        tail = Task { @MainActor [weak self] in
            _ = await previous?.value
            guard let self, self.generation == operationGeneration else { return }

            do {
                try await store.appendRoutePoints(points)
            } catch {
                if self.journalError == nil { self.journalError = error.localizedDescription }
            }

            guard self.generation == operationGeneration else { return }

            if let builder {
                do {
                    try await builder.insertRouteData(locations)
                    guard self.generation == operationGeneration else { return }
                    self.insertedPointCount += points.count
                } catch {
                    if self.insertionError == nil { self.insertionError = error.localizedDescription }
                }
            } else if self.insertionError == nil {
                self.insertionError = "HKWorkoutRouteBuilder indisponível"
            }

            self.completeOperation(generation: operationGeneration)
        }
    }

    func sealAndDrain(timeoutSeconds: TimeInterval = 5) async -> DrainResult {
        accepting = false
        guard pendingOperationCount > 0 else { return snapshot(timedOut: false) }

        return await withCheckedContinuation { continuation in
            let id = UUID()
            waiters[id] = DrainWaiter(continuation: continuation)
            Task { @MainActor [weak self] in
                try? await Task.sleep(
                    nanoseconds: UInt64(max(0.1, timeoutSeconds) * 1_000_000_000)
                )
                guard !Task.isCancelled else { return }
                self?.resolveWaiter(id: id, timedOut: true)
            }
        }
    }

    func invalidate() {
        generation = UUID()
        accepting = false
        tail?.cancel()
        tail = nil
        pendingOperationCount = 0
        routeBuilder = nil
        acceptedPointCount = 0
        insertedPointCount = 0
        rejectedPointCount = 0
        insertionError = nil
        journalError = nil
        mayContainPreexistingRouteData = false

        let currentWaiters = waiters
        waiters.removeAll()
        for waiter in currentWaiters.values {
            waiter.continuation.resume(returning: snapshot(timedOut: true))
        }
    }

    private func completeOperation(generation operationGeneration: UUID) {
        guard generation == operationGeneration else { return }
        pendingOperationCount = max(0, pendingOperationCount - 1)
        guard pendingOperationCount == 0 else { return }

        let ids = Array(waiters.keys)
        for id in ids { resolveWaiter(id: id, timedOut: false) }
    }

    private func resolveWaiter(id: UUID, timedOut: Bool) {
        guard let waiter = waiters.removeValue(forKey: id) else { return }
        waiter.continuation.resume(returning: snapshot(timedOut: timedOut))
    }

    private func snapshot(timedOut: Bool) -> DrainResult {
        DrainResult(
            acceptedPointCount: acceptedPointCount,
            insertedPointCount: insertedPointCount,
            rejectedPointCount: rejectedPointCount,
            insertionError: insertionError,
            journalError: journalError,
            timedOut: timedOut,
            mayContainPreexistingRouteData: mayContainPreexistingRouteData
        )
    }
}

import Foundation

enum WatchCoachAudioOwner: String, Codable, Equatable, Sendable {
    case watch
    case phone
    case none
}

struct WatchCoachRuntimePolicy: Codable, Equatable, Sendable {
    static let standard = WatchCoachRuntimePolicy(
        splitIntervalMeters: 1_000,
        minimumCueGapSeconds: 20,
        cueTimeToLiveSeconds: 8
    )

    let splitIntervalMeters: Double
    let minimumCueGapSeconds: TimeInterval
    let cueTimeToLiveSeconds: TimeInterval

    init(
        splitIntervalMeters: Double,
        minimumCueGapSeconds: TimeInterval,
        cueTimeToLiveSeconds: TimeInterval
    ) {
        self.splitIntervalMeters = max(100, splitIntervalMeters)
        self.minimumCueGapSeconds = max(0, minimumCueGapSeconds)
        self.cueTimeToLiveSeconds = max(1, cueTimeToLiveSeconds)
    }
}

struct WatchCoachSessionConfiguration: Codable, Equatable, Sendable {
    static let disabled = WatchCoachSessionConfiguration(
        enabled: false,
        audioOwner: .none,
        policy: .standard,
        isMuted: false
    )

    var enabled: Bool
    var audioOwner: WatchCoachAudioOwner
    var policy: WatchCoachRuntimePolicy
    var isMuted: Bool
}

struct WatchCoachCue: Equatable {
    let id: String
    let displayText: String
    let spokenText: String
    let createdAt: Date
    let expiresAt: Date
}

/// Motor puro do coach C1. Não conhece áudio, HealthKit ou UI e aceita relógio
/// injetado em `evaluate`, portanto suas regras podem ser validadas por fixtures.
struct WatchCoachEngine {
    private(set) var lastAnnouncedSplitIndex = 0

    private let policy: WatchCoachRuntimePolicy
    private var lastCueAt = Date.distantPast
    private var lastObservedDistanceMeters = 0.0
    private var lastObservedElapsedSeconds = 0.0
    private var lastBoundaryElapsedSeconds = 0.0

    init(policy: WatchCoachRuntimePolicy = .standard) {
        self.policy = policy
    }

    mutating func restore(distanceMeters: Double, elapsedSeconds: Int) {
        let safeDistance = max(0, distanceMeters)
        let safeElapsed = Double(max(0, elapsedSeconds))
        lastAnnouncedSplitIndex = Int(safeDistance / policy.splitIntervalMeters)
        lastCueAt = .distantPast
        lastObservedDistanceMeters = safeDistance
        lastObservedElapsedSeconds = safeElapsed

        let lastBoundaryDistance = Double(lastAnnouncedSplitIndex) * policy.splitIntervalMeters
        if safeDistance > 0 {
            lastBoundaryElapsedSeconds = safeElapsed * lastBoundaryDistance / safeDistance
        } else {
            lastBoundaryElapsedSeconds = 0
        }
    }

    mutating func evaluate(
        distanceMeters: Double,
        elapsedSeconds: Int,
        isPaused: Bool,
        now: Date = Date()
    ) -> WatchCoachCue? {
        let safeDistance = max(0, distanceMeters)
        let safeElapsed = Double(max(0, elapsedSeconds))
        defer {
            lastObservedDistanceMeters = safeDistance
            lastObservedElapsedSeconds = safeElapsed
        }

        if isPaused {
            discardCompletedSplits(
                distanceMeters: safeDistance,
                elapsedSeconds: safeElapsed
            )
            return nil
        }

        let completedSplitIndex = Int(safeDistance / policy.splitIntervalMeters)
        guard safeDistance >= policy.splitIntervalMeters,
              completedSplitIndex > lastAnnouncedSplitIndex else { return nil }

        // Um limite cruzado durante o cooldown já passou. Consumi-lo aqui
        // impede recriá-lo depois com TTL novo e falar uma orientação atrasada.
        guard now.timeIntervalSince(lastCueAt) >= policy.minimumCueGapSeconds else {
            discardCompletedSplits(
                distanceMeters: safeDistance,
                elapsedSeconds: safeElapsed
            )
            return nil
        }

        guard completedSplitIndex > lastAnnouncedSplitIndex else { return nil }

        let previousSplitIndex = lastAnnouncedSplitIndex
        let boundaryDistance = Double(completedSplitIndex) * policy.splitIntervalMeters
        let boundaryElapsedSeconds = interpolatedElapsed(
            atDistanceMeters: boundaryDistance,
            currentDistanceMeters: safeDistance,
            currentElapsedSeconds: safeElapsed
        )
        let coveredSplits = max(1, completedSplitIndex - previousSplitIndex)
        let splitDuration = max(
            0,
            (boundaryElapsedSeconds - lastBoundaryElapsedSeconds) / Double(coveredSplits)
        )
        let paceSecondsPerKilometer = splitDuration * 1_000 / policy.splitIntervalMeters

        lastAnnouncedSplitIndex = completedSplitIndex
        lastBoundaryElapsedSeconds = boundaryElapsedSeconds
        lastCueAt = now

        return makeCue(
            splitIndex: completedSplitIndex,
            paceSecondsPerKilometer: paceSecondsPerKilometer,
            now: now
        )
    }

    /// Distância recebida durante pausa nunca vira fala atrasada ao retomar.
    private mutating func discardCompletedSplits(
        distanceMeters: Double,
        elapsedSeconds: Double
    ) {
        let completedSplitIndex = Int(distanceMeters / policy.splitIntervalMeters)
        guard completedSplitIndex > lastAnnouncedSplitIndex else { return }
        lastAnnouncedSplitIndex = completedSplitIndex
        let boundaryDistance = Double(completedSplitIndex) * policy.splitIntervalMeters
        if distanceMeters > 0 {
            lastBoundaryElapsedSeconds = elapsedSeconds * boundaryDistance / distanceMeters
        } else {
            lastBoundaryElapsedSeconds = elapsedSeconds
        }
    }

    private func interpolatedElapsed(
        atDistanceMeters boundaryDistanceMeters: Double,
        currentDistanceMeters: Double,
        currentElapsedSeconds: Double
    ) -> Double {
        let distanceDelta = currentDistanceMeters - lastObservedDistanceMeters
        guard distanceDelta > 0 else { return currentElapsedSeconds }
        let progress = min(
            1,
            max(0, (boundaryDistanceMeters - lastObservedDistanceMeters) / distanceDelta)
        )
        return lastObservedElapsedSeconds
            + (currentElapsedSeconds - lastObservedElapsedSeconds) * progress
    }

    private func makeCue(
        splitIndex: Int,
        paceSecondsPerKilometer: Double,
        now: Date
    ) -> WatchCoachCue {
        let distanceMeters = Double(splitIndex) * policy.splitIntervalMeters
        let distanceKilometers = distanceMeters / 1_000
        let distanceLabel = Self.distanceLabel(kilometers: distanceKilometers)
        return WatchCoachCue(
            id: "split-\(splitIndex)",
            displayText: "Km \(distanceLabel) • \(Self.paceLabel(paceSecondsPerKilometer))/km",
            spokenText: Self.spokenSplit(
                distanceKilometers: distanceKilometers,
                paceSecondsPerKilometer: paceSecondsPerKilometer
            ),
            createdAt: now,
            expiresAt: now.addingTimeInterval(policy.cueTimeToLiveSeconds)
        )
    }

    private static func distanceLabel(kilometers: Double) -> String {
        if kilometers == kilometers.rounded() {
            return String(format: "%.0f", kilometers)
        }
        return String(format: "%.1f", kilometers)
    }

    private static func paceLabel(_ secondsPerKilometer: Double) -> String {
        guard secondsPerKilometer.isFinite, secondsPerKilometer > 0 else { return "--:--" }
        let totalSeconds = Int(secondsPerKilometer.rounded())
        return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
    }

    private static func spokenSplit(
        distanceKilometers: Double,
        paceSecondsPerKilometer: Double
    ) -> String {
        let distance = distanceLabel(kilometers: distanceKilometers)
        guard paceSecondsPerKilometer.isFinite,
              paceSecondsPerKilometer > 0 else {
            return "Quilômetro \(distance) concluído."
        }
        let totalSeconds = Int(paceSecondsPerKilometer.rounded())
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        if seconds == 0 {
            return "Quilômetro \(distance). Ritmo médio de \(minutes) minutos por quilômetro."
        }
        return "Quilômetro \(distance). Ritmo médio de \(minutes) minutos e \(seconds) segundos por quilômetro."
    }
}

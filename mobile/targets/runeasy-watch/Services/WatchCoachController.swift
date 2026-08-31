import AVFAudio
import Combine
import Foundation
import WatchKit
import os

private let coachLog = Logger(
    subsystem: "com.oytotec.runeasy.watchkitapp",
    category: "coach"
)

@MainActor
final class WatchCoachController: NSObject, ObservableObject {
    @Published private(set) var caption: String?
    @Published private(set) var isSpeaking = false
    @Published private(set) var isMuted = false

    private let synthesizer = AVSpeechSynthesizer()
    private var engine = WatchCoachEngine()
    private var audioOwner = WatchCoachAudioOwner.none
    private var isEnabled = false
    private var sessionGeneration = 0
    private var captionTask: Task<Void, Never>?
    private var speechTask: Task<Void, Never>?
    private weak var activeUtterance: AVSpeechUtterance?

    override init() {
        super.init()
        synthesizer.delegate = self
        synthesizer.usesApplicationAudioSession = true
    }

    /// `audioOwner` deve vir do contrato schema 3. O default `.none` impede
    /// fala dupla durante a janela de compatibilidade com snapshots antigos.
    func begin(
        enabled: Bool,
        audioOwner: WatchCoachAudioOwner = .none,
        policy: WatchCoachRuntimePolicy = .standard,
        distanceMeters: Double,
        elapsedSeconds: Int
    ) {
        cancelOutput()
        isEnabled = enabled
        self.audioOwner = audioOwner
        isMuted = false
        engine = WatchCoachEngine(policy: policy)
        engine.restore(
            distanceMeters: distanceMeters,
            elapsedSeconds: elapsedSeconds
        )
        coachLog.info(
            "coach begin enabled=\(enabled, privacy: .public) owner=\(audioOwner.rawValue, privacy: .public) elapsed=\(elapsedSeconds, privacy: .public)"
        )
    }

    func update(
        distanceMeters: Double,
        elapsedSeconds: Int,
        isPaused: Bool,
        now: Date = Date()
    ) {
        guard isEnabled,
              let cue = engine.evaluate(
                distanceMeters: distanceMeters,
                elapsedSeconds: elapsedSeconds,
                isPaused: isPaused,
                now: now
              ),
              canPresentAudio,
              cue.expiresAt > now else { return }

        present(cue)
    }

    func setMuted(_ muted: Bool) {
        guard isMuted != muted else { return }
        isMuted = muted
        if muted {
            cancelOutput()
        }
        coachLog.info("coach muted=\(muted, privacy: .public)")
    }

    func toggleMuted() {
        setMuted(!isMuted)
    }

    func pause() {
        cancelOutput()
    }

    func stop() {
        isEnabled = false
        audioOwner = .none
        cancelOutput()
    }

    private var canPresentAudio: Bool {
        isEnabled && !isMuted && audioOwner == .watch
    }

    private func present(_ cue: WatchCoachCue) {
        cancelOutput()
        let generation = sessionGeneration
        caption = cue.displayText
        WKInterfaceDevice.current().play(.notification)

        captionTask = Task { @MainActor [weak self] in
            let remaining = max(0, cue.expiresAt.timeIntervalSinceNow)
            try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            guard !Task.isCancelled,
                  self?.sessionGeneration == generation else { return }
            self?.clearCaption()
        }

        speechTask = Task { @MainActor [weak self] in
            guard let self,
                  !Task.isCancelled,
                  sessionGeneration == generation,
                  canPresentAudio,
                  cue.expiresAt > Date() else { return }
            await speak(cue, generation: generation)
        }
    }

    private func speak(_ cue: WatchCoachCue, generation: Int) async {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(
                .playback,
                mode: .voicePrompt,
                policy: .default,
                options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
            )
            try await audioSession.activate()

            guard !Task.isCancelled,
                  sessionGeneration == generation,
                  canPresentAudio,
                  cue.expiresAt > Date() else {
                deactivateAudioSession()
                return
            }

            let utterance = AVSpeechUtterance(string: cue.spokenText)
            utterance.voice = AVSpeechSynthesisVoice(language: "pt-BR")
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.92
            isSpeaking = true
            activeUtterance = utterance
            synthesizer.speak(utterance)
        } catch is CancellationError {
            deactivateAudioSession()
        } catch {
            isSpeaking = false
            coachLog.error(
                "falha ao falar cue \(cue.id, privacy: .public): \(error.localizedDescription, privacy: .public)"
            )
            // A legenda e o haptic já foram entregues como fallback offline.
            deactivateAudioSession()
        }
    }

    private func cancelOutput() {
        sessionGeneration += 1
        speechTask?.cancel()
        speechTask = nil
        captionTask?.cancel()
        captionTask = nil
        activeUtterance = nil
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
        caption = nil
        deactivateAudioSession()
    }

    private func clearCaption() {
        captionTask?.cancel()
        captionTask = nil
        caption = nil
    }

    private func deactivateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
        } catch {
            coachLog.info(
                "sessão de áudio já estava inativa: \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}

extension WatchCoachController: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didFinish utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            guard utterance === self.activeUtterance else { return }
            self.activeUtterance = nil
            self.isSpeaking = false
            self.speechTask = nil
            self.deactivateAudioSession()
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didCancel utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            guard utterance === self.activeUtterance else { return }
            self.activeUtterance = nil
            self.isSpeaking = false
            self.speechTask = nil
            self.deactivateAudioSession()
        }
    }
}

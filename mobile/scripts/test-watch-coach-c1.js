const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WATCH_TARGET = path.join(__dirname, "..", "targets", "runeasy-watch");
const ENGINE_SOURCE = path.join(WATCH_TARGET, "Models", "WatchCoachEngine.swift");
const CONTROLLER_SOURCE = path.join(
  WATCH_TARGET,
  "Services",
  "WatchCoachController.swift",
);
const MANAGER_SOURCE = path.join(WATCH_TARGET, "Services", "WorkoutManager.swift");
const VIEW_SOURCE = path.join(WATCH_TARGET, "Views", "ActiveRunView.swift");
const CHECKPOINT_SOURCE = path.join(
  WATCH_TARGET,
  "Services",
  "ActiveWorkoutCheckpointStore.swift",
);
const WATCH_SYNC_SOURCE = path.join(
  __dirname,
  "..",
  "src",
  "hooks",
  "useWatchSync.ts",
);

const STANDARD_POLICY = Object.freeze({
  splitIntervalMeters: 1_000,
  minimumCueGapSeconds: 20,
  cueTimeToLiveSeconds: 8,
});

class CoachReferenceEngine {
  constructor(policy = STANDARD_POLICY) {
    this.policy = policy;
    this.lastAnnouncedSplitIndex = 0;
    this.lastCueAt = Number.NEGATIVE_INFINITY;
    this.lastObservedDistanceMeters = 0;
    this.lastObservedElapsedSeconds = 0;
    this.lastBoundaryElapsedSeconds = 0;
  }

  restore(distanceMeters, elapsedSeconds) {
    const distance = Math.max(0, distanceMeters);
    const elapsed = Math.max(0, elapsedSeconds);
    this.lastAnnouncedSplitIndex = Math.floor(
      distance / this.policy.splitIntervalMeters,
    );
    this.lastCueAt = Number.NEGATIVE_INFINITY;
    this.lastObservedDistanceMeters = distance;
    this.lastObservedElapsedSeconds = elapsed;
    const boundary =
      this.lastAnnouncedSplitIndex * this.policy.splitIntervalMeters;
    this.lastBoundaryElapsedSeconds =
      distance > 0 ? (elapsed * boundary) / distance : 0;
  }

  evaluate({ distanceMeters, elapsedSeconds, isPaused, nowSeconds }) {
    const distance = Math.max(0, distanceMeters);
    const elapsed = Math.max(0, elapsedSeconds);
    const finish = () => {
      this.lastObservedDistanceMeters = distance;
      this.lastObservedElapsedSeconds = elapsed;
    };

    if (isPaused) {
      const completed = Math.floor(
        distance / this.policy.splitIntervalMeters,
      );
      if (completed > this.lastAnnouncedSplitIndex) {
        this.lastAnnouncedSplitIndex = completed;
        const boundary = completed * this.policy.splitIntervalMeters;
        this.lastBoundaryElapsedSeconds =
          distance > 0 ? (elapsed * boundary) / distance : elapsed;
      }
      finish();
      return null;
    }

    if (distance < this.policy.splitIntervalMeters) {
      finish();
      return null;
    }

    const completed = Math.floor(
      distance / this.policy.splitIntervalMeters,
    );
    if (completed <= this.lastAnnouncedSplitIndex) {
      finish();
      return null;
    }
    if (nowSeconds - this.lastCueAt < this.policy.minimumCueGapSeconds) {
      const boundary = completed * this.policy.splitIntervalMeters;
      this.lastAnnouncedSplitIndex = completed;
      this.lastBoundaryElapsedSeconds =
        distance > 0 ? (elapsed * boundary) / distance : elapsed;
      finish();
      return null;
    }

    const previous = this.lastAnnouncedSplitIndex;
    const boundary = completed * this.policy.splitIntervalMeters;
    const delta = distance - this.lastObservedDistanceMeters;
    const progress =
      delta > 0
        ? Math.min(
            1,
            Math.max(
              0,
              (boundary - this.lastObservedDistanceMeters) / delta,
            ),
          )
        : 1;
    const boundaryElapsed =
      delta > 0
        ? this.lastObservedElapsedSeconds +
          (elapsed - this.lastObservedElapsedSeconds) * progress
        : elapsed;
    const splitDuration =
      (boundaryElapsed - this.lastBoundaryElapsedSeconds) /
      Math.max(1, completed - previous);
    const pace =
      (Math.max(0, splitDuration) * 1_000) /
      this.policy.splitIntervalMeters;

    this.lastAnnouncedSplitIndex = completed;
    this.lastBoundaryElapsedSeconds = boundaryElapsed;
    this.lastCueAt = nowSeconds;
    finish();
    return {
      id: `split-${completed}`,
      paceSecondsPerKilometer: Math.round(pace),
      expiresAtSeconds: nowSeconds + this.policy.cueTimeToLiveSeconds,
    };
  }
}

function runBehaviorFixtures() {
  const interpolation = new CoachReferenceEngine();
  interpolation.restore(900, 300);
  assert.deepEqual(
    interpolation.evaluate({
      distanceMeters: 1_100,
      elapsedSeconds: 360,
      isPaused: false,
      nowSeconds: 100,
    }),
    {
      id: "split-1",
      paceSecondsPerKilometer: 330,
      expiresAtSeconds: 108,
    },
    "interpola o instante real de cruzamento do quilômetro",
  );

  const recovery = new CoachReferenceEngine();
  recovery.restore(1_250, 420);
  assert.equal(
    recovery.evaluate({
      distanceMeters: 1_300,
      elapsedSeconds: 435,
      isPaused: false,
      nowSeconds: 100,
    }),
    null,
    "não repete split anterior depois de recovery",
  );

  const paused = new CoachReferenceEngine();
  paused.restore(900, 300);
  assert.equal(
    paused.evaluate({
      distanceMeters: 1_100,
      elapsedSeconds: 300,
      isPaused: true,
      nowSeconds: 100,
    }),
    null,
    "não cria cue durante pausa",
  );
  assert.equal(
    paused.evaluate({
      distanceMeters: 1_150,
      elapsedSeconds: 315,
      isPaused: false,
      nowSeconds: 101,
    }),
    null,
    "não fala ao retomar um limite atravessado durante a pausa",
  );

  const jump = new CoachReferenceEngine();
  jump.restore(0, 0);
  assert.deepEqual(
    jump.evaluate({
      distanceMeters: 2_050,
      elapsedSeconds: 615,
      isPaused: false,
      nowSeconds: 100,
    }),
    {
      id: "split-2",
      paceSecondsPerKilometer: 300,
      expiresAtSeconds: 108,
    },
    "colapsa salto de múltiplos quilômetros sem enfileirar falas antigas",
  );

  const cooldown = new CoachReferenceEngine();
  cooldown.restore(0, 0);
  assert.ok(
    cooldown.evaluate({
      distanceMeters: 1_000,
      elapsedSeconds: 300,
      isPaused: false,
      nowSeconds: 100,
    }),
  );
  assert.equal(
    cooldown.evaluate({
      distanceMeters: 2_000,
      elapsedSeconds: 600,
      isPaused: false,
      nowSeconds: 110,
    }),
    null,
    "respeita o intervalo mínimo de fala",
  );
  assert.equal(
    cooldown.evaluate({
      distanceMeters: 2_050,
      elapsedSeconds: 615,
      isPaused: false,
      nowSeconds: 121,
    }),
    null,
    "não recria depois do cooldown um split que já expirou",
  );
}

function runSourceContractChecks() {
  const engine = fs.readFileSync(ENGINE_SOURCE, "utf8");
  const controller = fs.readFileSync(CONTROLLER_SOURCE, "utf8");
  const manager = fs.readFileSync(MANAGER_SOURCE, "utf8");
  const view = fs.readFileSync(VIEW_SOURCE, "utf8");
  const checkpoint = fs.readFileSync(CHECKPOINT_SOURCE, "utf8");
  const watchSync = fs.readFileSync(WATCH_SYNC_SOURCE, "utf8");
  const requirements = [
    [engine, "WatchCoachRuntimePolicy", "política injetável"],
    [engine, "discardCompletedSplits", "descarte durante pausa"],
    [engine, "now: Date = Date()", "relógio injetável"],
    [controller, "usesApplicationAudioSession = true", "sessão de áudio do app"],
    [controller, "audioOwner == .watch", "propriedade exclusiva do áudio"],
    [controller, "speechTask?.cancel()", "cancelamento de fala pendente"],
    [controller, "utterance === self.activeUtterance", "callback antigo isolado"],
    [controller, "setMuted(_ muted: Bool)", "mute durante a sessão"],
    [watchSync, "buildWatchCoachPolicy(featureFlags.audioCoach)", "policy emitida pelo iPhone"],
    [manager, "audioOwner: coachConfiguration.audioOwner", "ownership repassado ao controller"],
    [manager, "toggleCoachMuted()", "mute integrado ao manager"],
    [manager, "coachSessionIsAvailable", "controle de recovery independente do PhoneBridge"],
    [manager, "coachSessionIsMuted", "estado de mute publicado para a UI"],
    [checkpoint, "coachConfiguration: WatchCoachSessionConfiguration?", "policy persistida no recovery"],
    [view, "coachMuteButton", "controle de mute durante o tracking"],
    [view, ".privacySensitive()", "legenda protegida no Always On"],
  ];

  for (const [source, needle, label] of requirements) {
    assert.ok(source.includes(needle), `ausente: ${label}`);
  }
}

runBehaviorFixtures();
runSourceContractChecks();
console.log("PASS coach C1: 6 fixtures comportamentais + 16 contratos de integração/fonte.");

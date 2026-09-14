import { CATCH_SCORE } from "./gameRules";

export interface TimeSource { now(): number; }
export const performanceTimeSource: TimeSource = { now: () => performance.now() };

export class ActiveGameClock {
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private stoppedElapsed: number | null = null;

  constructor(readonly durationMs: number, private readonly time: TimeSource = performanceTimeSource) {}

  start() { this.startedAt = this.time.now(); this.pausedAt = null; this.pausedTotal = 0; this.stoppedElapsed = null; }
  pause() { if (this.startedAt !== null && this.pausedAt === null && this.stoppedElapsed === null) this.pausedAt = this.time.now(); }
  resume() { if (this.pausedAt === null || this.startedAt === null || this.stoppedElapsed !== null) return; this.pausedTotal += Math.max(0, this.time.now() - this.pausedAt); this.pausedAt = null; }
  elapsedMs() { if (this.startedAt === null) return 0; if (this.stoppedElapsed !== null) return this.stoppedElapsed; const now = this.pausedAt ?? this.time.now(); return Math.min(this.durationMs, Math.max(0, now - this.startedAt - this.pausedTotal)); }
  remainingMs() { return Math.max(0, this.durationMs - this.elapsedMs()); }
  displaySeconds() { return Math.ceil(this.remainingMs() / 1000); }
  expired() { return this.remainingMs() <= 0; }
  stop() { if (this.stoppedElapsed === null) this.stoppedElapsed = this.elapsedMs(); }
}

export function countdownNumber(startedAt: number, now: number, seconds: number): number {
  return Math.max(0, Math.ceil(seconds - Math.max(0, now - startedAt) / 1000));
}

export type ItemOutcome = "caught" | "missed";
export function createItemOutcomeTracker() {
  const outcomes = new Map<string, ItemOutcome>();
  let accepting = true;
  return {
    resolve(id: string, outcome: ItemOutcome, points = CATCH_SCORE) {
      if (!accepting || outcomes.has(id)) return { accepted: false, scoreDelta: 0, caughtDelta: 0 };
      outcomes.set(id, outcome);
      return { accepted: true, scoreDelta: outcome === "caught" ? points : 0, caughtDelta: outcome === "caught" ? 1 : 0 };
    },
    stop() { accepting = false; },
    reset() { outcomes.clear(); accepting = true; },
    outcomeOf(id: string) { return outcomes.get(id); },
  };
}

export function createLivesTracker(startingLives: number) {
  let remaining = startingLives;
  let missed = 0;
  return {
    remaining() { return remaining; },
    missed() { return missed; },
    depleted() { return remaining <= 0; },
    registerMiss() { missed += 1; remaining = Math.max(0, remaining - 1); return remaining; },
    reset() { remaining = startingLives; missed = 0; },
  };
}

export type ResumablePhase = "countdown" | "playing";
export type PauseReason = "blur" | "hidden" | "exit-confirm";

export function createPauseController() {
  const reasons = new Set<PauseReason>();
  let target: ResumablePhase = "playing";
  return {
    pause(reason: PauseReason, phase?: ResumablePhase) { reasons.add(reason); if (phase) target = phase; },
    clearReason(reason: PauseReason) { reasons.delete(reason); },
    canResume() { return reasons.size === 0; },
    targetPhase() { return target; },
    activeReasons() { return [...reasons]; },
    reset() { reasons.clear(); target = "playing"; },
  };
}

export function resizeCoordinate(value: number, previousSize: number, nextSize: number): number {
  if (previousSize <= 0 || nextSize <= 0) return value;
  return value * nextSize / previousSize;
}

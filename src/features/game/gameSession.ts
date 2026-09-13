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
    resolve(id: string, outcome: ItemOutcome) {
      if (!accepting || outcomes.has(id)) return { accepted: false, scoreDelta: 0, caughtDelta: 0 };
      outcomes.set(id, outcome);
      return { accepted: true, scoreDelta: outcome === "caught" ? CATCH_SCORE : 0, caughtDelta: outcome === "caught" ? 1 : 0 };
    },
    stop() { accepting = false; },
    reset() { outcomes.clear(); accepting = true; },
    outcomeOf(id: string) { return outcomes.get(id); },
  };
}

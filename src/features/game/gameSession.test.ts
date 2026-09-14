import { describe, expect, it } from "vitest";
import { ActiveGameClock, countdownNumber, createItemOutcomeTracker, createLivesTracker, createPauseController, resizeCoordinate } from "./gameSession";

describe("active game clock", () => {
  it("runs for exactly 30 active seconds and excludes paused time", () => {
    let now = 1000;
    const clock = new ActiveGameClock(30_000, { now: () => now });
    clock.start(); now = 11_000; clock.pause(); now = 31_000;
    expect(clock.remainingMs()).toBe(20_000);
    clock.resume(); now = 51_000;
    expect(clock.remainingMs()).toBe(0);
    expect(clock.displaySeconds()).toBe(0);
    expect(clock.expired()).toBe(true);
  });

  it("shows a 3, 2, 1 countdown before zero", () => {
    expect(countdownNumber(1000, 1000, 3)).toBe(3);
    expect(countdownNumber(1000, 2001, 3)).toBe(2);
    expect(countdownNumber(1000, 3001, 3)).toBe(1);
    expect(countdownNumber(1000, 4000, 3)).toBe(0);
  });
});

describe("item outcome tracker", () => {
  it("scores a falling instance at most once and never scores misses", () => {
    const tracker = createItemOutcomeTracker();
    expect(tracker.resolve("drop-1", "caught")).toMatchObject({ accepted: true, scoreDelta: 100, caughtDelta: 1 });
    expect(tracker.resolve("drop-1", "caught")).toMatchObject({ accepted: false, scoreDelta: 0 });
    expect(tracker.resolve("drop-2", "missed")).toMatchObject({ accepted: true, scoreDelta: 0, caughtDelta: 0 });
  });

  it("rejects every outcome after game end", () => {
    const tracker = createItemOutcomeTracker(); tracker.stop();
    expect(tracker.resolve("late", "caught").accepted).toBe(false);
  });
});

describe("lives tracker", () => {
  it("counts down from the starting hearts to zero and tracks total misses", () => {
    const lives = createLivesTracker(3);
    expect(lives.remaining()).toBe(3);
    expect(lives.registerMiss()).toBe(2);
    expect(lives.registerMiss()).toBe(1);
    expect(lives.depleted()).toBe(false);
    expect(lives.registerMiss()).toBe(0);
    expect(lives.depleted()).toBe(true);
    expect(lives.missed()).toBe(3);
  });

  it("never drops remaining lives below zero on extra misses", () => {
    const lives = createLivesTracker(1);
    lives.registerMiss();
    expect(lives.registerMiss()).toBe(0);
    expect(lives.missed()).toBe(2);
  });

  it("resets remaining lives and the miss count", () => {
    const lives = createLivesTracker(3);
    lives.registerMiss(); lives.registerMiss();
    lives.reset();
    expect(lives.remaining()).toBe(3);
    expect(lives.missed()).toBe(0);
  });
});

describe("game lifecycle", () => {
  it("keeps overlapping pause reasons and never resumes automatically", () => {
    const controller = createPauseController();
    controller.pause("blur", "countdown"); controller.pause("hidden");
    controller.clearReason("blur");
    expect(controller.canResume()).toBe(false);
    expect(controller.targetPhase()).toBe("countdown");
    controller.clearReason("hidden");
    expect(controller.canResume()).toBe(true);
  });

  it("rescales positions proportionally", () => {
    expect(resizeCoordinate(400, 800, 400)).toBe(200);
    expect(resizeCoordinate(120, 0, 400)).toBe(120);
  });
});

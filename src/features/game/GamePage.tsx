import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { StatusPanel } from "../../components/StatusPanel";
import type { CollectedItem, GameResult } from "../../domain/collection";
import { collectionRepository } from "../../services/storage/collectionRepository";
import { ActiveGameClock, createItemOutcomeTracker, createLivesTracker, createPauseController, resizeCoordinate, type PauseReason } from "./gameSession";
import { BASE_FALL_SPEED, DROP_RULES, SPAWN_INTERVAL_MS, dropForSlot, bonusXForNormal, crossesBasket, GAME_COUNTDOWN_SECONDS, GAME_DURATION_SECONDS, STARTING_HEARTS, clampBasketX, createDirectionController, fallSpeedMultiplier, pickRandomIndex, randomSpawnX, validNickname, type DropKind } from "./gameRules";

type Phase = "loading" | "idle" | "countdown" | "playing" | "paused" | "finished";
type FallingItem = { id: string; x: number; y: number; size: number; item: CollectedItem; kind: DropKind; points: number; speedMultiplier: number; costsHeart: boolean; bonusKind?: "fast" | "super" };
type CatchEffect = { id: string; x: number; y: number; points: number };
type SaveStatus = "idle" | "saving" | "success" | "failed";

export function GamePage({ onGoToCollection, onGoToRanking, onGameStateChange, navigationPause = false }: { onGoToCollection: () => void; onGoToRanking: () => void; onGameStateChange?: (active: boolean) => void; navigationPause?: boolean }) {
  const [items, setItems] = useState<CollectedItem[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [nickname, setNickname] = useState("");
  const [countdown, setCountdown] = useState(GAME_COUNTDOWN_SECONDS);
  const [seconds, setSeconds] = useState(GAME_DURATION_SECONDS);
  const [score, setScore] = useState(0);
  const [caught, setCaught] = useState(0);
  const [hearts, setHearts] = useState(STARTING_HEARTS);
  const [missed, setMissed] = useState(0);
  const [falling, setFalling] = useState<FallingItem[]>([]);
  const [effects, setEffects] = useState<CatchEffect[]>([]);
  const [completed, setCompleted] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [pauseReasons, setPauseReasons] = useState<PauseReason[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const basketX = useRef<number | null>(null);
  const direction = useRef(createDirectionController());
  const outcomes = useRef(createItemOutcomeTracker());
  const lives = useRef(createLivesTracker(STARTING_HEARTS));
  const pauses = useRef(createPauseController());
  const clock = useRef(new ActiveGameClock(GAME_DURATION_SECONDS * 1000));
  const countdownClock = useRef(new ActiveGameClock(GAME_COUNTDOWN_SECONDS * 1000));
  const lastFrame = useRef(0);
  const sequence = useRef(0);
  const scoreRef = useRef(0);
  const caughtRef = useRef(0);
  const sessionId = useRef("");
  const finished = useRef(false);
  const effectTimers = useRef(new Set<number>());
  const snapshot = useRef<CollectedItem[]>([]);
  const phaseRef = useRef<Phase>(phase);
  const arenaSize = useRef({ width: 0, height: 0 });
  const suppressCollisionFrames = useRef(0);
  const saving = useRef(false);
  phaseRef.current = phase;

  const urls = useMemo(() => new Map(items.map((item) => [item.id, URL.createObjectURL(item.image)])), [items]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  useEffect(() => {
    collectionRepository.getItems().then((loaded) => { setItems(loaded); setPhase("idle"); }).catch(() => { setError("저장된 물건을 불러오지 못했습니다."); setPhase("idle"); });
    return () => { outcomes.current.stop(); direction.current.clear(); effectTimers.current.forEach((timer) => window.clearTimeout(timer)); };
  }, []);
  useEffect(() => { onGameStateChange?.(["countdown", "playing", "paused"].includes(phase) || (phase === "finished" && saveStatus !== "success")); }, [onGameStateChange, phase, saveStatus]);

  const saveResult = useCallback(async (result: GameResult) => {
    if (saving.current) return;
    saving.current = true; setSaveStatus("saving"); setError(null);
    try { await collectionRepository.addGameResult(result); setSaveStatus("success"); }
    catch { setSaveStatus("failed"); setError("결과를 저장하지 못했습니다. 같은 기록으로 다시 시도할 수 있습니다."); }
    finally { saving.current = false; }
  }, []);

  useEffect(() => { if (completed && saveStatus === "idle") void saveResult(completed); }, [completed, saveResult, saveStatus]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    outcomes.current.stop(); clock.current.stop(); direction.current.clear();
    const result: GameResult = { id: sessionId.current, nickname: nickname.trim(), score: scoreRef.current, caughtCount: caughtRef.current, playedAt: new Date().toISOString() };
    setSaveStatus("idle"); setCompleted(result); setScore(result.score); setCaught(result.caughtCount); setFalling([]); setPhase("finished");
  }, [nickname]);

  const pauseGame = useCallback((reason: PauseReason) => {
    const current = phaseRef.current;
    if (current === "countdown" || current === "playing") {
      pauses.current.pause(reason, current);
      if (current === "countdown") countdownClock.current.pause(); else clock.current.pause();
      direction.current.clear(); setPauseReasons(pauses.current.activeReasons()); setPhase("paused");
    } else if (current === "paused") {
      pauses.current.pause(reason); setPauseReasons(pauses.current.activeReasons());
    }
  }, []);

  const clearPauseReason = useCallback((reason: PauseReason) => {
    pauses.current.clearReason(reason); setPauseReasons(pauses.current.activeReasons());
  }, []);

  const resumeGame = () => {
    if (!pauses.current.canResume()) return;
    const target = pauses.current.targetPhase();
    if (target === "countdown") countdownClock.current.resume(); else clock.current.resume();
    lastFrame.current = performance.now(); setPhase(target);
  };

  const start = () => {
    if (!validNickname(nickname) || !items.length) return;
    arenaSize.current = { width: 0, height: 0 }; suppressCollisionFrames.current = 0;
    snapshot.current = [...items]; sessionId.current = crypto.randomUUID(); sequence.current = 0; basketX.current = null; finished.current = false; pauses.current.reset(); setPauseReasons([]);
    effectTimers.current.forEach((timer) => window.clearTimeout(timer)); effectTimers.current.clear();
    outcomes.current.reset(); lives.current.reset(); scoreRef.current = 0; caughtRef.current = 0; setCompleted(null); setError(null); setScore(0); setCaught(0); setHearts(STARTING_HEARTS); setMissed(0); setFalling([]); setEffects([]); setSeconds(GAME_DURATION_SECONDS);
    countdownClock.current.start(); setCountdown(GAME_COUNTDOWN_SECONDS); setPhase("countdown");
  };

  const replay = async () => {
    setPhase("loading"); setError(null);
    try { const latestItems = await collectionRepository.getItems(); setItems(latestItems); setPhase("idle"); }
    catch { setError("최신 채집물을 불러오지 못했습니다. 다시 시도해 주세요."); setPhase("finished"); }
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    let animation = 0;
    const frame = (now: number) => {
      const value = countdownClock.current.displaySeconds();
      setCountdown(value);
      if (value <= 0) { clock.current.start(); lastFrame.current = now; setPhase("playing"); return; }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [phase]);

  useEffect(() => {
    if (navigationPause) pauseGame("exit-confirm"); else clearPauseReason("exit-confirm");
  }, [clearPauseReason, navigationPause, pauseGame]);

  useEffect(() => {
    if (!["countdown", "playing", "paused"].includes(phase)) return;
    const arena = arenaRef.current; if (!arena || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      const previous = arenaSize.current;
      if (previous.width > 0 && previous.height > 0 && (previous.width !== next.width || previous.height !== next.height)) {
        const basketWidth = Math.min(150, next.width * .22);
        if (basketX.current !== null) basketX.current = clampBasketX(resizeCoordinate(basketX.current, previous.width, next.width), next.width, basketWidth);
        setFalling((current) => current.map((item) => ({ ...item, x: resizeCoordinate(item.x, previous.width, next.width), y: resizeCoordinate(item.y, previous.height, next.height) })));
        setEffects((current) => current.map((effect) => ({ ...effect, x: resizeCoordinate(effect.x, previous.width, next.width), y: resizeCoordinate(effect.y, previous.height, next.height) })));
        suppressCollisionFrames.current = 1;
      }
      arenaSize.current = next;
    });
    observer.observe(arena); return () => observer.disconnect();
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    let animation = 0;
    const frame = (now: number) => {
      const delta = Math.min(50, now - lastFrame.current); lastFrame.current = now;
      setSeconds(clock.current.displaySeconds());
      if (clock.current.expired()) { finish(); return; }
      const arena = arenaRef.current; if (!arena) { animation = requestAnimationFrame(frame); return; }
      const width = arena.clientWidth; const height = arena.clientHeight; const basketWidth = Math.min(150, width * .22); const speed = width * .0008;
      if (basketX.current === null) basketX.current = width / 2;
      const active = direction.current.current(); const move = active === "left" ? -1 : active === "right" ? 1 : 0;
      basketX.current = clampBasketX(basketX.current + move * speed * delta, width, basketWidth);
      const currentBasketX = basketX.current;
      const suppressCollision = suppressCollisionFrames.current > 0;
      suppressCollisionFrames.current = Math.max(0, suppressCollisionFrames.current - 1);
      const fallSpeed = BASE_FALL_SPEED * fallSpeedMultiplier(clock.current.elapsedMs());
      setFalling((current) => current.flatMap((fallingItem) => {
        const y = fallingItem.y + delta * fallSpeed * height * fallingItem.speedMultiplier;
        const hit = crossesBasket(fallingItem.y, y, fallingItem.size, height) && Math.abs(fallingItem.x - currentBasketX) < (basketWidth + fallingItem.size) / 2;
        if (hit && !suppressCollision) {
          const resolution = outcomes.current.resolve(fallingItem.id, "caught", fallingItem.points);
          if (resolution.accepted) {
            scoreRef.current += resolution.scoreDelta; caughtRef.current += resolution.caughtDelta; setScore(scoreRef.current); setCaught(caughtRef.current);
            const effect = { id: `${fallingItem.id}-effect`, x: fallingItem.x, y: Math.min(y, height - 52), points: resolution.scoreDelta };
            setEffects((current) => [...current, effect]);
            const timer = window.setTimeout(() => { setEffects((current) => current.filter(({ id }) => id !== effect.id)); effectTimers.current.delete(timer); }, 420);
            effectTimers.current.add(timer);
          }
          return [];
        }
        if (y > height + fallingItem.size) {
          const resolution = outcomes.current.resolve(fallingItem.id, "missed");
          if (resolution.accepted && fallingItem.costsHeart) {
            const remaining = lives.current.registerMiss();
            setHearts(remaining); setMissed(lives.current.missed());
            if (remaining <= 0) finish();
          }
          return [];
        }
        return [{ ...fallingItem, y }];
      }));
      if (!finished.current) {
        const spawnNumber = Math.floor(clock.current.elapsedMs() / SPAWN_INTERVAL_MS);
        if (spawnNumber > sequence.current) {
          sequence.current += 1;
          const item = snapshot.current[pickRandomIndex(Math.random(), snapshot.current.length) ?? 0];
          if (item) {
            const rules = dropForSlot(sequence.current);
            const x = rules.bonusKind ? width * (Math.random() < .5 ? .12 : .88) : randomSpawnX(Math.random(), width, 54);
            const normalDrop: FallingItem = { id: `${sessionId.current}-${sequence.current}`, x, y: -60, size: 54, item, ...rules, bonusKind: undefined };
            const bonusItem = snapshot.current[pickRandomIndex(Math.random(), snapshot.current.length) ?? 0];
            const bonusDrop: FallingItem | null = rules.bonusKind && bonusItem ? {
              id: `${normalDrop.id}-bonus`, x: bonusXForNormal(x, width), y: -60, size: 54, item: bonusItem,
              kind: rules.bonusKind, ...DROP_RULES[rules.bonusKind],
            } : null;
            setFalling((current) => bonusDrop ? [...current, normalDrop, bonusDrop] : [...current, normalDrop]);
          }
        }
      }
      if (!finished.current) animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [finish, phase]);

  useEffect(() => {
    const keyMap: Record<string, "left" | "right"> = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
    const down = (event: KeyboardEvent) => { const key = keyMap[event.key]; if (!key || phase !== "playing") return; event.preventDefault(); direction.current.press(event.key, key, event.repeat); };
    const up = (event: KeyboardEvent) => { if (keyMap[event.key]) direction.current.release(event.key); };
    const blur = () => pauseGame("blur");
    const focus = () => clearPauseReason("blur");
    const visibility = () => document.hidden ? pauseGame("hidden") : clearPauseReason("hidden");
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); };
  }, [clearPauseReason, pauseGame, phase]);

  if (phase === "loading") return <div className="centered-page"><StatusPanel title="게임을 준비하고 있어요"><p>저장된 물건을 불러오는 중입니다.</p></StatusPanel></div>;
  if (!items.length) return <div className="centered-page"><StatusPanel title="먼저 물건을 모아주세요" action={<Button variant="primary" onClick={onGoToCollection}>채집으로 이동</Button>}><p>등록된 물건이 있어야 캐치 게임을 시작할 수 있습니다.</p></StatusPanel></div>;
  if (phase === "finished" && completed) return <div className="centered-page"><StatusPanel title="게임 종료"><p><strong>{completed.nickname}</strong>님, {completed.caughtCount}개를 받았어요.</p><p className="game-lives-summary">{missed}개를 놓치고 하트 {hearts}개가 남았어요.</p><p className="game-score">{completed.score.toLocaleString()}점</p><p className={`result-save result-save--${saveStatus}`} aria-live="polite">{saveStatus === "saving" && "결과를 저장하고 있어요…"}{saveStatus === "success" && "랭킹에 저장됐습니다."}{saveStatus === "failed" && error}</p><div className="status-panel__actions">{saveStatus === "failed" && <Button variant="primary" onClick={() => void saveResult(completed)}>저장 다시 시도</Button>}<Button variant={saveStatus === "success" ? "primary" : "secondary"} disabled={saveStatus === "saving"} onClick={() => void replay()}>{saveStatus === "failed" ? "저장하지 않고 다시하기" : "다시하기"}</Button><Button disabled={saveStatus !== "success"} onClick={onGoToRanking}>랭킹 보기</Button><Button disabled={saveStatus === "saving"} onClick={onGoToCollection}>채집으로 이동</Button></div></StatusPanel></div>;
  return <div className="game-page"><div className="game-hud" inert={phase === "idle"}><span className="game-hud__hearts" aria-label={`남은 하트 ${hearts}개`}><strong>{"♥".repeat(hearts)}{"♡".repeat(Math.max(0, STARTING_HEARTS - hearts))}</strong></span><span>성함 <strong>{nickname.trim()}</strong></span><span>남은 시간 <strong>{seconds}초</strong></span><span>점수 <strong>{score.toLocaleString()}</strong></span><span>받은 물건 <strong>{caught}</strong></span></div><div ref={arenaRef} className="game-arena">{falling.map((fallingItem) => <div key={fallingItem.id} className={`falling-item falling-item--${fallingItem.kind}`} style={{ left: fallingItem.x, top: fallingItem.y, width: fallingItem.size, height: fallingItem.size }}><img src={urls.get(fallingItem.item.id)} alt={fallingItem.item.name} />{fallingItem.kind !== "normal" && <span className="bonus-badge">{fallingItem.points}</span>}</div>)}{effects.map((effect) => <span key={effect.id} className="catch-effect" style={{ left: effect.x, top: effect.y }}>+{effect.points}</span>)}<div className="basket" style={{ left: basketX.current ?? "50%", width: "min(150px, 22%)" }} aria-label="바구니" />{phase === "countdown" && <div className="game-overlay"><strong>{countdown}</strong></div>}{phase === "paused" && <div className="game-overlay"><strong>일시정지</strong><p>{pauseReasons.length ? "창이 다시 활성화될 때까지 기다려 주세요." : "준비되면 게임을 이어가세요."}</p><Button variant="primary" disabled={!pauses.current.canResume()} onClick={resumeGame}>재개</Button></div>}</div><p className="game-help">← → 또는 A / D 를 눌러 바구니를 움직이세요 · 일반 100점 · 보너스 300 / 500점</p><Modal open={phase === "idle"} onClose={onGoToCollection} labelledBy="game-start-title" initialFocusRef={nameRef} className="game-start-modal"><button className="dialog__close" onClick={onGoToCollection} aria-label="게임 시작 닫기">×</button><p className="eyebrow">CATCH GAME · 30 SEC</p><h1 id="game-start-title">떨어지는 물건을 받아보세요</h1><p>반대편에 300점·500점 보너스가 따로 등장해요. 100점과 하트를 지킬지, 보너스를 노릴지 선택하세요. 보너스는 놓쳐도 하트가 줄지 않아요.</p><form onSubmit={(event) => { event.preventDefault(); start(); }}><label>성함<input ref={nameRef} value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder="성함을 입력하세요" /></label>{error && <p role="alert">{error}</p>}<Button type="submit" variant="primary" disabled={!validNickname(nickname)}>게임 시작</Button></form></Modal></div>;
}

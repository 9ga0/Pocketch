import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { StatusPanel } from "../../components/StatusPanel";
import type { CollectedItem } from "../../domain/collection";
import { collectionRepository } from "../../services/storage/collectionRepository";
import { CATCH_SCORE, GAME_COUNTDOWN_SECONDS, GAME_DURATION_SECONDS, clampBasketX, validNickname } from "./gameRules";

type Phase = "loading" | "idle" | "countdown" | "playing" | "paused" | "finished";
type FallingItem = { key: string; x: number; y: number; size: number; item: CollectedItem };

export function GamePage({ onGoToCollection, onGameStateChange }: { onGoToCollection: () => void; onGameStateChange?: (active: boolean) => void }) {
  const [items, setItems] = useState<CollectedItem[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [nickname, setNickname] = useState("");
  const [seconds, setSeconds] = useState(GAME_DURATION_SECONDS);
  const [score, setScore] = useState(0);
  const [caught, setCaught] = useState(0);
  const [falling, setFalling] = useState<FallingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const basketX = useRef(0);
  const pressed = useRef(new Map<string, number>());
  const sequence = useRef(0);
  const startedAt = useRef(0);
  const lastFrame = useRef(0);
  const snapshot = useRef<CollectedItem[]>([]);
  const countdownTimer = useRef<number | undefined>(undefined);

  const urls = useMemo(() => new Map(items.map((item) => [item.id, URL.createObjectURL(item.image)])), [items]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  useEffect(() => { collectionRepository.getItems().then((loaded) => { setItems(loaded); setPhase("idle"); }).catch(() => { setError("저장된 물건을 불러오지 못했습니다."); setPhase("idle"); }); return () => { if (countdownTimer.current) window.clearTimeout(countdownTimer.current); }; }, []);
  useEffect(() => { onGameStateChange?.(phase === "countdown" || phase === "playing" || phase === "paused"); }, [onGameStateChange, phase]);

  const finish = useCallback(() => { setPhase("finished"); setFalling([]); pressed.current.clear(); }, []);
  const start = () => {
    if (!validNickname(nickname) || !items.length) return;
    snapshot.current = [...items]; sequence.current = 0; setScore(0); setCaught(0); setFalling([]); setSeconds(GAME_DURATION_SECONDS); setPhase("countdown");
    countdownTimer.current = window.setTimeout(() => { startedAt.current = performance.now(); lastFrame.current = startedAt.current; setPhase((current) => current === "countdown" ? "playing" : current); }, GAME_COUNTDOWN_SECONDS * 1000);
  };

  useEffect(() => {
    if (phase !== "playing") return;
    let animation = 0;
    const frame = (now: number) => {
      const delta = Math.min(50, now - lastFrame.current); lastFrame.current = now;
      const remaining = Math.max(0, GAME_DURATION_SECONDS - (now - startedAt.current) / 1000); setSeconds(Math.ceil(remaining));
      if (remaining <= 0) { finish(); return; }
      const arena = arenaRef.current; if (!arena) { animation = requestAnimationFrame(frame); return; }
      const width = arena.clientWidth; const height = arena.clientHeight; const basketWidth = Math.min(150, width * .22); const speed = width * .0008;
      const active = [...pressed.current.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; const move = active === "left" ? -1 : active === "right" ? 1 : 0;
      basketX.current = clampBasketX(basketX.current + move * speed * delta, width, basketWidth);
      setFalling((current) => { let gained = 0; let caughtNow = 0; const next = current.flatMap((fallingItem) => { const y = fallingItem.y + delta * .00038 * height; const hit = y + fallingItem.size >= height - 48 && y <= height - 18 && Math.abs(fallingItem.x - basketX.current) < (basketWidth + fallingItem.size) / 2; if (hit) { gained += CATCH_SCORE; caughtNow += 1; return []; } return y > height + fallingItem.size ? [] : [{ ...fallingItem, y }]; }); if (gained) { setScore((value) => value + gained); setCaught((value) => value + caughtNow); } return next; });
      if (Math.floor((now - startedAt.current) / 900) > sequence.current) { sequence.current += 1; const item = snapshot.current[Math.floor(Math.random() * snapshot.current.length)]; if (item) setFalling((current) => [...current, { key: `${item.id}-${sequence.current}`, x: Math.random() * Math.max(1, width - 80) + 40, y: -60, size: 54, item }]); }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame); return () => cancelAnimationFrame(animation);
  }, [finish, phase]);

  useEffect(() => {
    const keyMap: Record<string, "left" | "right"> = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
    const down = (event: KeyboardEvent) => { const key = keyMap[event.key]; if (!key || (phase !== "playing" && phase !== "paused")) return; event.preventDefault(); pressed.current.set(key, performance.now()); };
    const up = (event: KeyboardEvent) => { const key = keyMap[event.key]; if (key) pressed.current.delete(key); };
    const pause = () => { if (phase === "playing") { pressed.current.clear(); setPhase("paused"); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", pause); document.addEventListener("visibilitychange", pause);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", pause); document.removeEventListener("visibilitychange", pause); };
  }, [phase]);

  if (phase === "loading") return <div className="centered-page"><StatusPanel title="게임을 준비하고 있어요"><p>저장된 물건을 불러오는 중입니다.</p></StatusPanel></div>;
  if (!items.length) return <div className="centered-page"><StatusPanel title="먼저 물건을 모아주세요" action={<Button variant="primary" onClick={onGoToCollection}>채집으로 이동</Button>}><p>등록된 물건이 있어야 캐치 게임을 시작할 수 있습니다.</p></StatusPanel></div>;
  if (phase === "idle") return <div className="game-start centered-page"><div className="game-start__card"><p className="eyebrow">CATCH GAME · 30 SEC</p><h1>떨어지는 물건을 받아보세요</h1><label>닉네임<input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder="이름을 입력하세요" /></label>{error && <p className="camera-error">{error}</p>}<Button variant="primary" disabled={!validNickname(nickname)} onClick={start}>게임 시작</Button></div></div>;
  if (phase === "finished") return <div className="centered-page"><StatusPanel title="게임 종료"><p><strong>{nickname.trim()}</strong>님, {caught}개를 받았어요.</p><p className="game-score">{score.toLocaleString()}점</p><div className="status-panel__actions"><Button variant="primary" onClick={() => setPhase("idle")}>다시하기</Button><Button onClick={onGoToCollection}>채집으로 이동</Button></div></StatusPanel></div>;
  return <div className="game-page"><div className="game-hud"><span>남은 시간 <strong>{seconds}초</strong></span><span>점수 <strong>{score.toLocaleString()}</strong></span><span>받은 물건 <strong>{caught}</strong></span></div><div ref={arenaRef} className="game-arena">{falling.map((fallingItem) => <img key={fallingItem.key} className="falling-item" src={urls.get(fallingItem.item.id)} alt={fallingItem.item.name} style={{ left: fallingItem.x, top: fallingItem.y, width: fallingItem.size, height: fallingItem.size }} />)}<div className="basket" style={{ left: basketX.current }} aria-label="바구니" />{phase === "countdown" && <div className="game-overlay"><strong>{GAME_COUNTDOWN_SECONDS}</strong></div>}{phase === "paused" && <div className="game-overlay"><strong>일시정지</strong><Button variant="primary" onClick={() => { lastFrame.current = performance.now(); setPhase("playing"); }}>재개</Button></div>}</div><p className="game-help">← → 또는 A / D 를 눌러 바구니를 움직이세요</p></div>;
}

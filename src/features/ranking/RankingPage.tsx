import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusPanel } from "../../components/StatusPanel";
import type { GameResult } from "../../domain/collection";
import { collectionRepository } from "../../services/storage/collectionRepository";

export function RankingPage() {
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setResults(await collectionRepository.getTopResults()); } catch { setError("랭킹을 읽지 못했습니다. 저장된 데이터는 삭제되지 않았습니다."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const reset = async () => { setBusy(true); setError(null); try { await collectionRepository.resetResults(); setResults([]); setResetOpen(false); } catch { setError("랭킹을 초기화하지 못했습니다. 다시 시도해 주세요."); setResetOpen(false); } finally { setBusy(false); } };
  if (loading) return <div className="centered-page"><StatusPanel title="랭킹을 불러오고 있어요" /></div>;
  if (error && !results.length) return <div className="centered-page"><StatusPanel tone="error" title="랭킹을 불러오지 못했어요" action={<Button variant="primary" onClick={() => void load()}>다시 시도</Button>}><p>{error}</p></StatusPanel></div>;
  return <div className="ranking-page"><div className="ranking-heading"><div><p className="eyebrow">LOCAL TOP 10</p><h1>이 기기의 최고 기록</h1></div><Button variant="danger" disabled={!results.length} onClick={() => setResetOpen(true)}>랭킹 초기화</Button></div>{error && <p className="camera-error">{error}</p>}{!results.length ? <StatusPanel title="아직 기록이 없어요"><p>게임을 완료하면 이 기기의 상위 기록이 여기에 표시됩니다.</p></StatusPanel> : <ol className="ranking-list">{results.map((result, index) => <li key={result.id} className={index === 0 ? "ranking-list__first" : undefined}><span className="ranking-rank">{index + 1}</span><strong>{result.nickname}</strong><span>{result.caughtCount}개</span><b>{result.score.toLocaleString()}점</b><time dateTime={result.playedAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.playedAt))}</time></li>)}</ol>}<ConfirmDialog open={resetOpen} title="랭킹을 모두 지울까요?" description="저장된 게임 기록만 삭제합니다. 채집한 물건과 축소 설정은 유지됩니다." confirmLabel="랭킹 초기화" busy={busy} onCancel={() => setResetOpen(false)} onConfirm={() => void reset()} /></div>;
}

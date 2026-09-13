// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectionSceneBridge } from "../../engine/collectionBridge";
import { subscribeToSharedSession, type SharedSessionSnapshot } from "../../services/sync/sessionSync";
import { SharedSessionPage } from "./SharedSessionPage";

vi.mock("../../engine/CollectionSceneView", () => ({
  CollectionSceneView: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="scene-stub">{items.length}</div>
  ),
}));

vi.mock("../../services/sync/sessionSync", () => ({
  subscribeToSharedSession: vi.fn(),
}));

afterEach(cleanup);

describe("SharedSessionPage", () => {
  let onChange: (snapshot: SharedSessionSnapshot) => void;
  let onError: (error: unknown) => void;
  const unsubscribe = vi.fn();

  beforeEach(() => {
    unsubscribe.mockClear();
    vi.mocked(subscribeToSharedSession).mockImplementation((_sessionId, change, error) => {
      onChange = change;
      onError = error;
      return unsubscribe;
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:shared-item"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows a loading panel before the first snapshot arrives", () => {
    render(<SharedSessionPage sessionId="session-1" onExit={vi.fn()} />);
    expect(screen.getByText("공유된 채집물을 불러오고 있어요")).not.toBeNull();
  });

  it("renders shared items once the session snapshot is ready", () => {
    render(<SharedSessionPage sessionId="session-1" onExit={vi.fn()} />);
    act(() => onChange({
      exists: true,
      settings: { scaleLevel: 1, globalScale: 0.7 },
      items: [{
        id: "a",
        name: "노란 컵",
        description: "책상 위",
        imageBase64: btoa("fake"),
        imageContentType: "image/webp",
        width: 100,
        height: 100,
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
    }));
    expect(screen.getByTestId("scene-stub").textContent).toBe("1");
  });

  it("opens and closes a read-only detail view without a delete action", async () => {
    const user = userEvent.setup();
    render(<SharedSessionPage sessionId="session-1" onExit={vi.fn()} />);
    act(() => onChange({
      exists: true,
      settings: null,
      items: [{
        id: "a",
        name: "노란 컵",
        description: "책상 위",
        imageBase64: btoa("fake"),
        imageContentType: "image/webp",
        width: 100,
        height: 100,
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
    }));

    act(() => collectionSceneBridge.emit({ type: "item:detail-requested", itemId: "a" }));
    expect(await screen.findByText("노란 컵")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "상세 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a not-found message when the session no longer exists, and exits", async () => {
    const onExit = vi.fn();
    const user = userEvent.setup();
    render(<SharedSessionPage sessionId="session-1" onExit={onExit} />);
    act(() => onChange({ exists: false, settings: null, items: [] }));
    expect(screen.getByText("이 공유 링크를 열 수 없어요")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "내 채집물로 이동" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("surfaces subscription errors", () => {
    render(<SharedSessionPage sessionId="session-1" onExit={vi.fn()} />);
    act(() => onError(new Error("네트워크 오류")));
    expect(screen.getByText("네트워크 오류")).not.toBeNull();
  });

  it("unsubscribes when the session id changes or the page unmounts", () => {
    const { rerender, unmount } = render(<SharedSessionPage sessionId="session-1" onExit={vi.fn()} />);
    rerender(<SharedSessionPage sessionId="session-2" onExit={vi.fn()} />);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});

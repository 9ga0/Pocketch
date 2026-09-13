// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionSettings } from "../../domain/collection";
import { isFirebaseConfigured } from "../../services/sync/firebaseConfig";
import { ensureSession, revokeSession } from "../../services/sync/sessionSync";
import { ShareSessionPanel } from "./ShareSessionPanel";

vi.mock("../../services/sync/firebaseConfig", () => ({
  isFirebaseConfigured: vi.fn(() => true),
}));

vi.mock("../../services/sync/sessionSync", () => ({
  ensureSession: vi.fn(),
  revokeSession: vi.fn(),
}));

const settings: CollectionSettings = { id: "collection-settings", scaleLevel: 0, globalScale: 1 };

afterEach(cleanup);

describe("ShareSessionPanel", () => {
  beforeEach(() => {
    vi.mocked(isFirebaseConfigured).mockReturnValue(true);
    vi.mocked(ensureSession).mockReset();
    vi.mocked(revokeSession).mockReset();
  });

  it("shows a setup notice instead of controls when Firebase is not configured", () => {
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);
    render(<ShareSessionPanel settings={settings} onSettingsChange={vi.fn()} />);
    expect(screen.getByText(/Firebase 설정이 필요합니다/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "공유 링크 만들기" })).toBeNull();
  });

  it("creates a session and persists the returned sessionId", async () => {
    vi.mocked(ensureSession).mockResolvedValue("session-123");
    const onSettingsChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ShareSessionPanel settings={settings} onSettingsChange={onSettingsChange} />);

    await user.click(screen.getByRole("button", { name: "공유 링크 만들기" }));

    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, sessionId: "session-123" }));
    expect(ensureSession).toHaveBeenCalledWith(settings);
  });

  it("shows an error message when creating a session fails", async () => {
    vi.mocked(ensureSession).mockRejectedValue(new Error("네트워크 오류"));
    const user = userEvent.setup();
    render(<ShareSessionPanel settings={settings} onSettingsChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "공유 링크 만들기" }));
    expect((await screen.findByRole("alert")).textContent).toBe("네트워크 오류");
  });

  it("shows the share link and copies it, once shared", async () => {
    const shared = { ...settings, sessionId: "session-123" };
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareSessionPanel settings={shared} onSettingsChange={vi.fn()} />);

    const link = screen.getByLabelText("공유 링크") as HTMLInputElement;
    expect(link.value).toContain("?session=session-123");

    await user.click(screen.getByRole("button", { name: "복사" }));
    expect(writeText).toHaveBeenCalledWith(link.value);
    expect(await screen.findByRole("button", { name: "복사됨" })).not.toBeNull();
  });

  it("revokes sharing and clears the local sessionId", async () => {
    vi.mocked(revokeSession).mockResolvedValue(undefined);
    const onSettingsChange = vi.fn().mockResolvedValue(undefined);
    const shared = { ...settings, sessionId: "session-123" };
    const user = userEvent.setup();
    render(<ShareSessionPanel settings={shared} onSettingsChange={onSettingsChange} />);

    await user.click(screen.getByRole("button", { name: "공유 해제" }));

    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledWith({ ...shared, sessionId: undefined }));
    expect(revokeSession).toHaveBeenCalledWith("session-123");
  });
});

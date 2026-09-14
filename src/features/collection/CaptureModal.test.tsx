// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollectedItem } from "../../domain/collection";
import { CaptureModal } from "./CaptureModal";

vi.mock("./CameraCapture", () => ({
  CameraCapture: ({ onBackgroundRemovalRequested }: { onBackgroundRemovalRequested: (blob: Blob) => void }) => (
    <button onClick={() => onBackgroundRemovalRequested(new Blob(["frame"]))}>mock-capture</button>
  ),
}));

vi.mock("./ItemRegistration", () => ({
  ItemRegistration: ({
    onCancel,
    onSaved,
    onManageItems,
  }: {
    onCancel: () => void;
    onSaved: (item: CollectedItem) => void;
    onManageItems: () => void;
  }) => (
    <div>
      <button onClick={onCancel}>mock-cancel</button>
      <button onClick={() => onSaved({ id: "x" } as CollectedItem)}>mock-save</button>
      <button onClick={onManageItems}>mock-manage</button>
    </div>
  ),
}));

afterEach(cleanup);

describe("CaptureModal", () => {
  it("renders nothing when closed", () => {
    render(<CaptureModal open={false} onClose={vi.fn()} onSaved={vi.fn()} onManageItems={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves from the camera step to registration, then resets to camera after saving", async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<CaptureModal open onClose={vi.fn()} onSaved={onSaved} onManageItems={vi.fn()} />);

    await user.click(screen.getByText("mock-capture"));
    await user.click(await screen.findByText("mock-save"));

    expect(onSaved).toHaveBeenCalledWith({ id: "x" });
    expect(await screen.findByText("mock-capture")).not.toBeNull();
  });

  it("closes and lets the caller reopen at the camera step, discarding a mid-registration draft", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<CaptureModal open onClose={onClose} onSaved={vi.fn()} onManageItems={vi.fn()} />);

    await user.click(screen.getByText("mock-capture"));
    await screen.findByText("mock-cancel");
    await user.click(screen.getByRole("button", { name: "촬영 닫기" }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<CaptureModal open={false} onClose={onClose} onSaved={vi.fn()} onManageItems={vi.fn()} />);
    rerender(<CaptureModal open onClose={onClose} onSaved={vi.fn()} onManageItems={vi.fn()} />);
    expect(screen.getByText("mock-capture")).not.toBeNull();
  });

  it("closes via cancel from the registration step", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CaptureModal open onClose={onClose} onSaved={vi.fn()} onManageItems={vi.fn()} />);
    await user.click(screen.getByText("mock-capture"));
    await user.click(await screen.findByText("mock-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes then forwards a manage-items request from a quota failure", async () => {
    const onClose = vi.fn();
    const onManageItems = vi.fn();
    const user = userEvent.setup();
    render(<CaptureModal open onClose={onClose} onSaved={vi.fn()} onManageItems={onManageItems} />);
    await user.click(screen.getByText("mock-capture"));
    await user.click(await screen.findByText("mock-manage"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onManageItems).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CaptureModal open onClose={onClose} onSaved={vi.fn()} onManageItems={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await user.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageError } from "../../services/storage/errors";
import { ItemRegistration } from "./ItemRegistration";

const source = new Blob(["camera"], { type: "image/jpeg" });
const processed = {
  blob: new Blob(["webp"], { type: "image/webp" }),
  width: 800,
  height: 600,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(overrides: Partial<React.ComponentProps<typeof ItemRegistration>> = {}) {
  const props: React.ComponentProps<typeof ItemRegistration> = {
    source,
    onCancel: vi.fn(),
    onSaved: vi.fn(),
    onManageItems: vi.fn(),
    removeBackground: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
    optimizeImage: vi.fn().mockResolvedValue(processed),
    addItem: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ItemRegistration {...props} />);
  return props;
}

describe("ItemRegistration", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:transparent-preview"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "stable-item-id") });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("processes locally and requires a trimmed name before saving", async () => {
    const props = setup();
    const user = userEvent.setup();
    expect(await screen.findByAltText("배경이 제거된 물건 미리보기")).not.toBeNull();

    await user.type(screen.getByLabelText(/이름/), "   ");
    await user.click(screen.getByRole("button", { name: "채집물에 추가" }));
    expect(screen.getByText("물건 이름을 입력해 주세요.")).not.toBeNull();
    expect(props.addItem).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/이름/), "노란 컵  ");
    await user.type(screen.getByLabelText(/설명/), "  책상 위 컵  ");
    await user.click(screen.getByRole("button", { name: "채집물에 추가" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(props.addItem).toHaveBeenCalledWith(expect.objectContaining({
      id: "stable-item-id",
      name: "노란 컵",
      description: "책상 위 컵",
      image: processed.blob,
      width: 800,
      height: 600,
    }));
  });

  it("locks duplicate submissions while the database write is pending", async () => {
    const pending = deferred<void>();
    const addItem = vi.fn(() => pending.promise);
    const props = setup({ addItem });
    const user = userEvent.setup();
    await screen.findByAltText("배경이 제거된 물건 미리보기");
    await user.type(screen.getByLabelText(/이름/), "우산");
    const save = screen.getByRole("button", { name: "채집물에 추가" });
    await Promise.all([user.click(save), user.click(save)]);
    expect(addItem).toHaveBeenCalledOnce();
    expect(props.onSaved).not.toHaveBeenCalled();
    pending.resolve();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
  });

  it("retries a failed write with the same id and only reports success after commit", async () => {
    const addItem = vi.fn()
      .mockRejectedValueOnce(new StorageError("write-failed", "저장 실패"))
      .mockResolvedValueOnce(undefined);
    const props = setup({ addItem });
    const user = userEvent.setup();
    await screen.findByAltText("배경이 제거된 물건 미리보기");
    await user.type(screen.getByLabelText(/이름/), "연필");
    await user.click(screen.getByRole("button", { name: "채집물에 추가" }));
    expect(await screen.findByText("저장 실패")).not.toBeNull();
    expect(props.onSaved).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "저장 다시 시도" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(addItem.mock.calls[0][0].id).toBe(addItem.mock.calls[1][0].id);
  });

  it("ignores a late processing result after cancellation", async () => {
    const pending = deferred<Blob>();
    const optimizeImage = vi.fn().mockResolvedValue(processed);
    const props = setup({ removeBackground: vi.fn(() => pending.promise), optimizeImage });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "취소" }));
    pending.resolve(new Blob(["late"]));
    await Promise.resolve();
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(optimizeImage).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("links quota failures to item management", async () => {
    const onManageItems = vi.fn();
    setup({
      onManageItems,
      addItem: vi.fn().mockRejectedValue(new StorageError("quota-exceeded", "공간 부족")),
    });
    const user = userEvent.setup();
    await screen.findByAltText("배경이 제거된 물건 미리보기");
    await user.type(screen.getByLabelText(/이름/), "노트");
    await user.click(screen.getByRole("button", { name: "채집물에 추가" }));
    await user.click(await screen.findByRole("button", { name: "채집물 관리" }));
    expect(onManageItems).toHaveBeenCalledOnce();
  });
});

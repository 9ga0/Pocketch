// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageError } from "../../services/storage/errors";
import { ItemRegistration } from "./ItemRegistration";

const source = new Blob(["camera"], { type: "image/jpeg" });
const segmented = new Blob(["png"], { type: "image/png" });
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
    segmentObject: vi.fn().mockResolvedValue(segmented),
    removeBackground: vi.fn().mockResolvedValue(segmented),
    optimizeImage: vi.fn().mockResolvedValue(processed),
    addItem: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ItemRegistration {...props} />);
  return props;
}

async function selectObject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "분리할 물건 선택" }));
  await screen.findByAltText("배경을 제거한 물건 미리보기");
}

describe("ItemRegistration", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:image-preview"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "stable-item-id") });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for the user to select an object and forwards the selected point", async () => {
    const segmentObject = vi.fn().mockResolvedValue(segmented);
    setup({ segmentObject });
    const target = screen.getByRole("button", { name: "분리할 물건 선택" });
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      left: 10, top: 20, width: 200, height: 100,
    } as DOMRect);

    await userEvent.setup().pointer({ target, coords: { clientX: 110, clientY: 70 }, keys: "[MouseLeft]" });
    await screen.findByAltText("배경을 제거한 물건 미리보기");
    expect(segmentObject).toHaveBeenCalledWith(source, { x: 0.5, y: 0.5 }, expect.any(Function));
  });

  it("falls back to general background removal if interactive segmentation fails", async () => {
    const removeBackground = vi.fn().mockResolvedValue(segmented);
    setup({
      segmentObject: vi.fn().mockRejectedValue(new Error("model failed")),
      removeBackground,
    });
    await selectObject(userEvent.setup());
    expect(removeBackground).toHaveBeenCalledWith(source, expect.any(Function));
  });

  it("requires a trimmed name before saving", async () => {
    const props = setup();
    const user = userEvent.setup();
    await selectObject(user);

    await user.type(screen.getByLabelText(/이름/), "   ");
    await user.click(screen.getByRole("button", { name: "채집물에 추가" }));
    expect(screen.getByText("물건 이름을 입력해 주세요.")).not.toBeNull();
    expect(props.addItem).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/이름/), "머그 컵 ");
    await user.type(screen.getByLabelText(/설명/), "  책상 위 컵 ");
    await user.click(screen.getByRole("button", { name: "채집물에 추가" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(props.addItem).toHaveBeenCalledWith(expect.objectContaining({
      id: "stable-item-id",
      name: "머그 컵",
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
    await selectObject(user);
    await user.type(screen.getByLabelText(/이름/), "우산");
    const save = screen.getByRole("button", { name: "채집물에 추가" });
    await Promise.all([user.click(save), user.click(save)]);
    expect(addItem).toHaveBeenCalledOnce();
    pending.resolve();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
  });

  it("ignores a late segmentation result after cancellation", async () => {
    const pending = deferred<Blob>();
    const optimizeImage = vi.fn().mockResolvedValue(processed);
    const props = setup({ segmentObject: vi.fn(() => pending.promise), optimizeImage });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "분리할 물건 선택" }));
    await user.click(await screen.findByRole("button", { name: "취소" }));
    pending.resolve(segmented);
    await Promise.resolve();
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(optimizeImage).not.toHaveBeenCalled();
  });

  it("links quota failures to item management", async () => {
    const onManageItems = vi.fn();
    setup({
      onManageItems,
      addItem: vi.fn().mockRejectedValue(new StorageError("quota-exceeded", "공간 부족")),
    });
    const user = userEvent.setup();
    await selectObject(user);
    await user.type(screen.getByLabelText(/이름/), "힌트");
    await user.click(screen.getByRole("button", { name: "채집물에 추가" }));
    await user.click(await screen.findByRole("button", { name: "채집물 관리" }));
    expect(onManageItems).toHaveBeenCalledOnce();
  });
});

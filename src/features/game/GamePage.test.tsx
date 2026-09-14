// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GamePage } from "./GamePage";
import { collectionRepository } from "../../services/storage/collectionRepository";

vi.mock("../../services/storage/collectionRepository", () => ({
  collectionRepository: { getItems: vi.fn(), addGameResult: vi.fn() },
}));
beforeEach(() => {
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:item"), revokeObjectURL: vi.fn() });
  vi.mocked(collectionRepository.getItems).mockResolvedValue([{
    id: "cup", name: "컵", description: "", image: new Blob(), width: 100, height: 100, createdAt: "",
  }]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("focuses the name, rejects whitespace and starts countdown on form submission", async () => {
  render(<GamePage onGoToCollection={vi.fn()} onGoToRanking={vi.fn()} />);
  const input = await screen.findByLabelText("성함");
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: "   " } });
  expect((screen.getByRole("button", { name: "게임 시작" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "홍길동" } });
  fireEvent.submit(input.closest("form")!);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("3")).not.toBeNull();
});

it("returns to collection on Escape and ignores backdrop clicks", async () => {
  const exit = vi.fn();
  render(<GamePage onGoToCollection={exit} onGoToRanking={vi.fn()} />);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(dialog.parentElement!);
  expect(exit).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(exit).toHaveBeenCalledOnce();
});

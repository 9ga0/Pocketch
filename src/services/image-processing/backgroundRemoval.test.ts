import { describe, expect, it } from "vitest";
import { backgroundRemovalAssetPath } from "./backgroundRemoval";

describe("background removal asset path", () => {
  it("uses the deployed same-origin base path", () => {
    expect(backgroundRemovalAssetPath("/", "https://pocketch.example")).toBe("https://pocketch.example/background-removal/");
    expect(backgroundRemovalAssetPath("/booth/", "https://pocketch.example")).toBe("https://pocketch.example/booth/background-removal/");
  });
});

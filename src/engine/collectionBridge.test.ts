import { describe, expect, it, vi } from "vitest";
import { createCollectionSceneBridge } from "./collectionBridge";

describe("collection scene bridge", () => {
  it("delivers typed commands and stops after unsubscribe", () => {
    const bridge = createCollectionSceneBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.onCommand(listener);
    bridge.dispatch({ type: "item:remove", itemId: "item-1" });
    unsubscribe();
    bridge.dispatch({ type: "collection:reset" });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "item:remove", itemId: "item-1" });
  });

  it("delivers scene events without frame coordinates", () => {
    const bridge = createCollectionSceneBridge();
    const listener = vi.fn();
    bridge.onEvent(listener);
    bridge.emit({ type: "item:detail-requested", itemId: "item-2" });
    expect(listener).toHaveBeenCalledWith({ type: "item:detail-requested", itemId: "item-2" });
  });
});

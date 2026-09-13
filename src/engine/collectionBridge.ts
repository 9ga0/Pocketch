import type { CollectedItem } from "../domain/collection";

export type CollectionSceneCommand =
  | { type: "item:add"; item: CollectedItem }
  | { type: "item:remove"; itemId: string }
  | { type: "collection:reset" }
  | { type: "physics:gravity"; x: number; y: number }
  | { type: "physics:shake" };

export type CollectionSceneEvent =
  | { type: "scene:ready" }
  | { type: "item:detail-requested"; itemId: string };

type CommandListener = (command: CollectionSceneCommand) => void;
type EventListener = (event: CollectionSceneEvent) => void;

export interface CollectionSceneBridge {
  dispatch(command: CollectionSceneCommand): void;
  emit(event: CollectionSceneEvent): void;
  onCommand(listener: CommandListener): () => void;
  onEvent(listener: EventListener): () => void;
}

export function createCollectionSceneBridge(): CollectionSceneBridge {
  const commandListeners = new Set<CommandListener>();
  const eventListeners = new Set<EventListener>();
  return {
    dispatch(command) { commandListeners.forEach((listener) => listener(command)); },
    emit(event) { eventListeners.forEach((listener) => listener(event)); },
    onCommand(listener) {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };
}

export const collectionSceneBridge = createCollectionSceneBridge();

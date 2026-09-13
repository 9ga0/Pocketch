import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { CollectedItem, CollectionSettings } from "../domain/collection";
import { globalScaleForLevel, itemDisplaySize, shouldShrinkCollection } from "../domain/collectionRules";
import { collectionRepository } from "../services/storage/collectionRepository";
import { collectionSceneBridge } from "./collectionBridge";

interface Props { items: CollectedItem[]; settings: CollectionSettings; }

export function CollectionSceneView({ items, settings }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const settingsRef = useRef(settings);
  itemsRef.current = items;
  settingsRef.current = settings;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let game: Phaser.Game | undefined;
    const urls = new Map<string, string>();

    class CollectionScene extends Phaser.Scene {
      private sprites = new Map<string, Phaser.Physics.Matter.Image>();
      private shrinkCheckPending = false;
      private lastSize = { width: 0, height: 0 };
      private unsubscribe?: () => void;

      constructor() { super({ key: "pocketch-collection" }); }

      preload() {
        itemsRef.current.forEach((item) => {
          const url = URL.createObjectURL(item.image);
          urls.set(item.id, url);
          this.load.image(item.id, url);
        });
      }

      create() {
        this.lastSize = { width: this.scale.width, height: this.scale.height };
        this.matter.world.setBounds(0, 0, this.scale.width, this.scale.height, 32, true, true, true, true);
        itemsRef.current.forEach((item) => this.addItem(item));
        this.scale.on("resize", this.resize, this);
        this.unsubscribe = collectionSceneBridge.onCommand(this.command);
        collectionSceneBridge.emit({ type: "scene:ready" });
      }

      private command = (command: Parameters<typeof collectionSceneBridge.dispatch>[0]) => {
        if (command.type === "item:add") { this.shrinkCheckPending = true; this.addItem(command.item); }
        if (command.type === "item:remove") this.removeItem(command.itemId);
        if (command.type === "collection:reset") this.sprites.forEach((sprite) => sprite.destroy());
        if (command.type === "collection:reset") this.sprites.clear();
      };

      private addItem = (item: CollectedItem) => {
        if (!this.textures.exists(item.id)) {
          const url = URL.createObjectURL(item.image);
          urls.set(item.id, url);
          this.load.image(item.id, url);
          this.load.once(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
            if (key === item.id) this.addItem(item);
          });
          this.load.start();
          return;
        }
        if (this.sprites.has(item.id)) return;
        const size = itemDisplaySize(item, this.scale.width, this.scale.height, settingsRef.current.globalScale);
        const x = Phaser.Math.Between(Math.ceil(size.width / 2 + 12), Math.floor(this.scale.width - size.width / 2 - 12));
        const sprite = this.matter.add.image(x, Math.max(size.height, 36), item.id, undefined, { restitution: 0.18, friction: 0.8, frictionAir: 0.02 });
        sprite.setDisplaySize(size.width, size.height);
        sprite.setInteractive({ useHandCursor: true });
        this.installLongPress(sprite, item.id);
        this.sprites.set(item.id, sprite);
      };

      private installLongPress(sprite: Phaser.Physics.Matter.Image, itemId: string) {
        let timer: number | undefined;
        const cancel = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; };
        sprite.on(Phaser.Input.Events.POINTER_DOWN, () => { timer = window.setTimeout(() => { timer = undefined; collectionSceneBridge.emit({ type: "item:detail-requested", itemId }); }, 600); });
        sprite.on(Phaser.Input.Events.POINTER_UP, cancel);
        sprite.on(Phaser.Input.Events.POINTER_OUT, cancel);
        sprite.on(Phaser.Input.Events.POINTER_MOVE, cancel);
        sprite.on(Phaser.Input.Events.GAME_OUT, cancel);
      }

      private removeItem(itemId: string) { this.sprites.get(itemId)?.destroy(); this.sprites.delete(itemId); }

      update() {
        if (this.shrinkCheckPending && this.sprites.size && shouldShrinkCollection(Math.min(...[...this.sprites.values()].map((sprite) => sprite.getBounds().top)), this.scale.height)) {
          this.shrinkCheckPending = false;
          const nextLevel = settingsRef.current.scaleLevel + 1;
          const nextScale = globalScaleForLevel(nextLevel);
          settingsRef.current = { ...settingsRef.current, scaleLevel: nextLevel, globalScale: nextScale };
          this.sprites.forEach((sprite, id) => {
            const item = itemsRef.current.find((candidate) => candidate.id === id);
            if (!item) return;
            const size = itemDisplaySize(item, this.scale.width, this.scale.height, nextScale);
            sprite.setDisplaySize(size.width, size.height);
            sprite.setPosition(Phaser.Math.Clamp(sprite.x, size.width / 2 + 8, this.scale.width - size.width / 2 - 8), Phaser.Math.Clamp(sprite.y, size.height / 2 + 8, this.scale.height - size.height / 2 - 8));
          });
          void collectionRepository.updateSettings(settingsRef.current);
        }
      }

      private resize = (size: Phaser.Structs.Size) => {
        this.matter.world.setBounds(0, 0, size.width, size.height, 32, true, true, true, true);
        this.sprites.forEach((sprite) => sprite.setPosition(Phaser.Math.Clamp(sprite.x, 24, size.width - 24), Phaser.Math.Clamp(sprite.y, 24, size.height - 24)));
        this.lastSize = { width: size.width, height: size.height };
      };

      shutdown() { this.unsubscribe?.(); this.unsubscribe = undefined; }
    }

    game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: host.clientWidth || 640, height: Math.max(320, host.clientHeight || 420), transparent: true, scene: CollectionScene, physics: { default: "matter", matter: { gravity: { x: 0, y: 1 }, positionIterations: 6, velocityIterations: 4 } }, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH } });
    return () => { game?.destroy(true); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  return <div ref={hostRef} className="collection-scene" aria-label="물리 채집 장면" role="application" />;
}

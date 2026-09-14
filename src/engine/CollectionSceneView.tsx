import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { CollectedItem, CollectionSettings } from "../domain/collection";
import { globalScaleForLevel, itemDisplaySize, shouldShrinkCollection } from "../domain/collectionRules";
import { collectionRepository } from "../services/storage/collectionRepository";
import { collectionSceneBridge } from "./collectionBridge";
import { POINTER_PUSH_RADIUS, pointerPushForBody, type Point } from "./pointerPush";

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
      private static readonly MAX_VELOCITY = 22;
      private static readonly DRAG_THRESHOLD = 6;
      private sprites = new Map<string, Phaser.Physics.Matter.Image>();
      private shrinkCheckPending = false;
      private lastSize = { width: 0, height: 0 };
      private unsubscribe?: () => void;
      private lastPointerPosition: Point | null = null;

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
        this.input.on(Phaser.Input.Events.POINTER_MOVE, this.pushItemsWithPointer);
        this.input.on(Phaser.Input.Events.GAME_OUT, this.resetPointerPosition);
        this.unsubscribe = collectionSceneBridge.onCommand(this.command);
        collectionSceneBridge.emit({ type: "scene:ready" });
      }

      private command = (command: Parameters<typeof collectionSceneBridge.dispatch>[0]) => {
        if (command.type === "item:add") { this.shrinkCheckPending = true; this.addItem(command.item); }
        if (command.type === "item:remove") this.removeItem(command.itemId);
        if (command.type === "collection:reset") this.sprites.forEach((sprite) => sprite.destroy());
        if (command.type === "collection:reset") this.sprites.clear();
      };

      private pushItemsWithPointer = (pointer: Phaser.Input.Pointer) => {
        const current = { x: pointer.worldX, y: pointer.worldY };
        const isInside = current.x >= 0 && current.x <= this.scale.width
          && current.y >= 0 && current.y <= this.scale.height;
        if (!isInside) {
          this.resetPointerPosition();
          return;
        }

        const previous = this.lastPointerPosition;
        this.lastPointerPosition = current;
        if (!previous) return;

        this.sprites.forEach((sprite) => {
          const body = sprite.body as MatterJS.BodyType | null;
          if (!body || body.isStatic) return;
          const bodyRadius = Math.min(60, Math.max(sprite.displayWidth, sprite.displayHeight) / 2);
          const push = pointerPushForBody(previous, current, sprite, POINTER_PUSH_RADIUS + bodyRadius);
          if (!push) return;
          this.setSpriteVelocity(
            sprite,
            body.velocity.x + push.x,
            body.velocity.y + push.y,
          );
        });
      };

      private resetPointerPosition = () => { this.lastPointerPosition = null; };

      private setSpriteVelocity(sprite: Phaser.Physics.Matter.Image, x: number, y: number) {
        const speed = Math.hypot(x, y);
        const scale = speed > CollectionScene.MAX_VELOCITY ? CollectionScene.MAX_VELOCITY / speed : 1;
        sprite.setVelocity(x * scale, y * scale);
      }

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
        this.installPointerInteractions(sprite, item.id);
        this.sprites.set(item.id, sprite);
      };

      /**
       * 길게 누르면 상세 모달을 열고, 임계값 이상 이동하면 드래그로 전환한다.
       * 기울기 센서가 없는 환경(데스크톱, 권한 거부)에서도 손으로 채집물을 섞을 수 있는 대체 동작이다.
       */
      private installPointerInteractions(sprite: Phaser.Physics.Matter.Image, itemId: string) {
        let longPressTimer: number | undefined;
        let pointerDownAt: { x: number; y: number } | null = null;
        let dragging = false;
        let lastPointer = { x: 0, y: 0 };
        let lastMoveAt = 0;
        let lastVelocity = { x: 0, y: 0 };

        const clearLongPress = () => {
          if (longPressTimer !== undefined) window.clearTimeout(longPressTimer);
          longPressTimer = undefined;
        };

        const endDrag = () => {
          if (!dragging) return;
          dragging = false;
          sprite.setStatic(false);
          this.setSpriteVelocity(sprite, lastVelocity.x, lastVelocity.y);
        };

        const finish = () => {
          clearLongPress();
          endDrag();
          pointerDownAt = null;
        };

        sprite.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
          pointerDownAt = { x: pointer.worldX, y: pointer.worldY };
          lastPointer = { ...pointerDownAt };
          lastVelocity = { x: 0, y: 0 };
          lastMoveAt = pointer.time;
          longPressTimer = window.setTimeout(() => {
            longPressTimer = undefined;
            collectionSceneBridge.emit({ type: "item:detail-requested", itemId });
          }, 600);
        });

        sprite.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
          if (!pointerDownAt) return;
          const dx = pointer.worldX - pointerDownAt.x;
          const dy = pointer.worldY - pointerDownAt.y;
          if (!dragging && Math.hypot(dx, dy) > CollectionScene.DRAG_THRESHOLD) {
            clearLongPress();
            dragging = true;
            sprite.setStatic(true);
          }
          if (!dragging) return;
          const dt = Math.max(1, pointer.time - lastMoveAt);
          lastVelocity = {
            x: ((pointer.worldX - lastPointer.x) / dt) * 16,
            y: ((pointer.worldY - lastPointer.y) / dt) * 16,
          };
          sprite.setPosition(pointer.worldX, pointer.worldY);
          lastPointer = { x: pointer.worldX, y: pointer.worldY };
          lastMoveAt = pointer.time;
        });

        sprite.on(Phaser.Input.Events.POINTER_UP, finish);
        sprite.on(Phaser.Input.Events.POINTER_OUT, finish);
        sprite.on(Phaser.Input.Events.GAME_OUT, finish);
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
          collectionSceneBridge.emit({ type: "settings:changed", settings: settingsRef.current });
        }
      }

      private resize = (size: Phaser.Structs.Size) => {
        this.matter.world.setBounds(0, 0, size.width, size.height, 32, true, true, true, true);
        this.sprites.forEach((sprite) => sprite.setPosition(Phaser.Math.Clamp(sprite.x, 24, size.width - 24), Phaser.Math.Clamp(sprite.y, 24, size.height - 24)));
        this.lastSize = { width: size.width, height: size.height };
      };

      shutdown() {
        this.resetPointerPosition();
        this.input.off(Phaser.Input.Events.POINTER_MOVE, this.pushItemsWithPointer);
        this.input.off(Phaser.Input.Events.GAME_OUT, this.resetPointerPosition);
        this.unsubscribe?.();
        this.unsubscribe = undefined;
      }
    }

    game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: host.clientWidth || 640, height: Math.max(320, host.clientHeight || 420), transparent: true, scene: CollectionScene, physics: { default: "matter", matter: { gravity: { x: 0, y: 1 }, positionIterations: 6, velocityIterations: 4 } }, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH } });
    return () => { game?.destroy(true); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  return <div ref={hostRef} className="collection-scene" aria-label="물리 채집 장면" role="application" />;
}

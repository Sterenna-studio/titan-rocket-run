import Phaser from 'phaser';
import type { WorldEntity, CollisionCircle } from '../types/game';

const BONE_TEXTURE = 'collectible-bone';

function distanceSq(a: CollisionCircle, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export class CollectibleSystem {
  createTextures(scene: Phaser.Scene): void {
    if (scene.textures.exists(BONE_TEXTURE)) {
      return;
    }

    const graphics = scene.add.graphics();
    graphics.setVisible(false);
    graphics.fillStyle(0xf4fff0, 1);
    graphics.lineStyle(3, 0x62ff52, 0.45);
    graphics.strokeCircle(40, 24, 22);
    graphics.save();
    graphics.translateCanvas(40, 24);
    graphics.rotateCanvas(-0.42);
    graphics.fillCircle(-18, -9, 9);
    graphics.fillCircle(-18, 9, 9);
    graphics.fillCircle(18, -9, 9);
    graphics.fillCircle(18, 9, 9);
    graphics.fillRect(-18, -8, 36, 16);
    graphics.restore();
    graphics.generateTexture(BONE_TEXTURE, 80, 48);
    graphics.destroy();
  }

  createBone(scene: Phaser.Scene, entity: WorldEntity): Phaser.GameObjects.Image {
    return scene.add
      .image(entity.x, entity.y, BONE_TEXTURE)
      .setDepth(14)
      .setScale(entity.r / 19);
  }

  findCollected(player: CollisionCircle, entities: WorldEntity[], time: number): WorldEntity[] {
    return entities.filter((entity) => {
      if (entity.hit || entity.type !== 'bone') {
        return false;
      }

      const y = entity.y + Math.sin(time * 3 + entity.bob) * 6;
      const radius = entity.r + player.r;
      return distanceSq(player, { x: entity.x, y }) <= radius * radius;
    });
  }
}

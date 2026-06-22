import Phaser from 'phaser';
import type { CollisionCircle, WorldEntity } from '../types/game';

const MINE_TEXTURE = 'hazard-mine';

function distanceSq(a: CollisionCircle, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export class MineSystem {
  createTextures(scene: Phaser.Scene): void {
    if (scene.textures.exists(MINE_TEXTURE)) {
      return;
    }

    const graphics = scene.add.graphics();
    graphics.setVisible(false);
    graphics.save();
    graphics.translateCanvas(36, 36);
    graphics.fillStyle(0xff5b46, 1);
    graphics.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const radius = i % 2 ? 30 : 17;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.fillStyle(0x2a0a06, 1);
    graphics.fillCircle(0, 0, 10);
    graphics.restore();
    graphics.generateTexture(MINE_TEXTURE, 72, 72);
    graphics.destroy();
  }

  createMine(scene: Phaser.Scene, entity: WorldEntity): Phaser.GameObjects.Image {
    return scene.add
      .image(entity.x, entity.y, MINE_TEXTURE)
      .setDepth(13)
      .setScale(entity.r / 24);
  }

  findHits(player: CollisionCircle, entities: WorldEntity[], time: number): WorldEntity[] {
    return entities.filter((entity) => {
      if (entity.hit || entity.type !== 'mine') {
        return false;
      }

      const y = entity.y + Math.sin(time * 3 + entity.bob) * 6;
      const radius = entity.r + player.r;
      return distanceSq(player, { x: entity.x, y }) <= radius * radius;
    });
  }
}

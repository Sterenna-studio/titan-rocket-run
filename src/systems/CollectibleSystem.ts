import Phaser from 'phaser';
import type { WorldEntity, CollisionCircle } from '../types/game';

const BONE_TEXTURE = 'collectible-bone';
const UNDERGROUND_BOOST_TEXTURE = 'collectible-underground-boost';

function distanceSq(a: CollisionCircle, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export class CollectibleSystem {
  createTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists(BONE_TEXTURE)) {
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

    if (!scene.textures.exists(UNDERGROUND_BOOST_TEXTURE)) {
      const graphics = scene.add.graphics();
      graphics.setVisible(false);
      graphics.fillStyle(0x8cfffb, 0.22);
      graphics.fillCircle(40, 40, 36);
      graphics.lineStyle(5, 0x8cfffb, 0.92);
      graphics.strokeCircle(40, 40, 30);
      graphics.lineStyle(3, 0xffd36a, 0.9);
      graphics.beginPath();
      graphics.moveTo(40, 13);
      graphics.lineTo(58, 42);
      graphics.lineTo(45, 42);
      graphics.lineTo(45, 66);
      graphics.lineTo(35, 66);
      graphics.lineTo(35, 42);
      graphics.lineTo(22, 42);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      graphics.generateTexture(UNDERGROUND_BOOST_TEXTURE, 80, 80);
      graphics.destroy();
    }
  }

  createBone(scene: Phaser.Scene, entity: WorldEntity): Phaser.GameObjects.Image {
    const texture = entity.type === 'undergroundBoost' ? UNDERGROUND_BOOST_TEXTURE : BONE_TEXTURE;
    return scene.add
      .image(entity.x, entity.y, texture)
      .setDepth(14)
      .setScale(entity.type === 'undergroundBoost' ? entity.r / 30 : entity.r / 19);
  }

  findCollected(player: CollisionCircle, entities: WorldEntity[], time: number): WorldEntity[] {
    return entities.filter((entity) => {
      if (entity.hit) {
        return false;
      }

      const y = entity.y + Math.sin(time * 3 + entity.bob) * 6;
      const radius = entity.r + player.r;
      return distanceSq(player, { x: entity.x, y }) <= radius * radius;
    });
  }
}

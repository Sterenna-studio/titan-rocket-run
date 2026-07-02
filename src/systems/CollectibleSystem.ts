import Phaser from 'phaser';
import type { WorldEntity, CollisionCircle, EntityKind, ObstacleEntity } from '../types/game';

const BONE_TEXTURE = 'collectible-bone';
const UNDERGROUND_BOOST_TEXTURE = 'collectible-underground-boost';
const OBSTACLE_TEXTURES: Record<EntityKind, string> = {
  bone: BONE_TEXTURE,
  undergroundBoost: UNDERGROUND_BOOST_TEXTURE,
  seagull: 'obstacle-seagull',
  cable: 'obstacle-cable',
  granny: 'obstacle-granny',
  menhir: 'obstacle-menhir',
  gust: 'obstacle-gust',
};
const COLLECTIBLE_TYPES = new Set<EntityKind>(['bone', 'undergroundBoost']);

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

    this.createObstacleTextures(scene);
  }

  createBone(scene: Phaser.Scene, entity: WorldEntity): Phaser.GameObjects.Image {
    const texture = OBSTACLE_TEXTURES[entity.type];
    const scale =
      entity.type === 'undergroundBoost'
        ? entity.r / 30
        : entity.type === 'bone'
          ? entity.r / 19
          : entity.type === 'cable'
            ? entity.r / 26
            : entity.type === 'menhir'
              ? entity.r / 34
              : entity.r / 30;
    return scene.add
      .image(entity.x, entity.y, texture)
      .setDepth(14)
      .setScale(scale);
  }

  findCollected(player: CollisionCircle, entities: WorldEntity[], time: number): WorldEntity[] {
    return entities.filter((entity) => {
      if (entity.hit || !this.isCollectible(entity)) {
        return false;
      }

      const y = entity.y + Math.sin(time * 3 + entity.bob) * 6;
      const radius = entity.r + player.r;
      return distanceSq(player, { x: entity.x, y }) <= radius * radius;
    });
  }

  findObstacleHits(player: CollisionCircle, entities: WorldEntity[], time: number): ObstacleEntity[] {
    return entities.filter((entity): entity is ObstacleEntity => {
      if (entity.hit || !this.isObstacle(entity)) {
        return false;
      }

      const bob = entity.type === 'seagull' || entity.type === 'gust' ? Math.sin(time * 2.4 + entity.bob) * 8 : 0;
      const radius = entity.r + player.r;
      return distanceSq(player, { x: entity.x, y: entity.y + bob }) <= radius * radius;
    });
  }

  isCollectible(entity: WorldEntity): boolean {
    return COLLECTIBLE_TYPES.has(entity.type);
  }

  isObstacle(entity: WorldEntity): entity is ObstacleEntity {
    return !COLLECTIBLE_TYPES.has(entity.type);
  }

  private createObstacleTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists(OBSTACLE_TEXTURES.seagull)) {
      const graphics = scene.add.graphics();
      graphics.setVisible(false);
      graphics.lineStyle(7, 0xf0fff4, 1);
      graphics.lineBetween(12, 32, 32, 14);
      graphics.lineBetween(32, 14, 54, 32);
      graphics.lineBetween(54, 32, 76, 14);
      graphics.lineBetween(76, 14, 98, 32);
      graphics.lineStyle(3, 0x65d9ff, 0.8);
      graphics.lineBetween(45, 34, 61, 34);
      graphics.generateTexture(OBSTACLE_TEXTURES.seagull, 112, 58);
      graphics.destroy();
    }

    if (!scene.textures.exists(OBSTACLE_TEXTURES.cable)) {
      const graphics = scene.add.graphics();
      graphics.setVisible(false);
      graphics.lineStyle(7, 0x15181c, 1);
      graphics.lineBetween(8, 32, 32, 15);
      graphics.lineBetween(32, 15, 60, 32);
      graphics.lineBetween(60, 32, 88, 49);
      graphics.lineBetween(88, 49, 116, 28);
      graphics.lineStyle(3, 0xffd36a, 0.8);
      graphics.lineBetween(28, 23, 44, 36);
      graphics.lineBetween(80, 38, 97, 25);
      graphics.generateTexture(OBSTACLE_TEXTURES.cable, 124, 64);
      graphics.destroy();
    }

    if (!scene.textures.exists(OBSTACLE_TEXTURES.granny)) {
      const graphics = scene.add.graphics();
      graphics.setVisible(false);
      graphics.fillStyle(0xf0fff4, 1);
      graphics.fillCircle(34, 18, 14);
      graphics.fillStyle(0xd6a0ff, 1);
      graphics.fillRoundedRect(18, 31, 34, 39, 12);
      graphics.lineStyle(5, 0xf0fff4, 0.95);
      graphics.lineBetween(17, 41, 3, 30);
      graphics.lineBetween(53, 41, 70, 30);
      graphics.lineStyle(4, 0x15181c, 0.8);
      graphics.lineBetween(26, 70, 20, 86);
      graphics.lineBetween(43, 70, 51, 86);
      graphics.fillStyle(0x15181c, 0.95);
      graphics.fillCircle(29, 17, 2);
      graphics.fillCircle(39, 17, 2);
      graphics.generateTexture(OBSTACLE_TEXTURES.granny, 76, 92);
      graphics.destroy();
    }

    if (!scene.textures.exists(OBSTACLE_TEXTURES.menhir)) {
      const graphics = scene.add.graphics();
      graphics.setVisible(false);
      graphics.fillStyle(0x8d9593, 1);
      graphics.fillRoundedRect(16, 10, 46, 92, 18);
      graphics.fillStyle(0x596360, 0.7);
      graphics.fillTriangle(18, 102, 62, 102, 52, 16);
      graphics.lineStyle(4, 0xf0fff4, 0.28);
      graphics.lineBetween(30, 25, 50, 49);
      graphics.lineBetween(28, 68, 46, 66);
      graphics.generateTexture(OBSTACLE_TEXTURES.menhir, 80, 112);
      graphics.destroy();
    }

    if (!scene.textures.exists(OBSTACLE_TEXTURES.gust)) {
      const graphics = scene.add.graphics();
      graphics.setVisible(false);
      graphics.lineStyle(6, 0x8cfffb, 0.9);
      graphics.lineBetween(10, 34, 44, 12);
      graphics.lineBetween(44, 12, 92, 26);
      graphics.lineBetween(92, 26, 126, 48);
      graphics.lineBetween(126, 48, 74, 54);
      graphics.lineStyle(3, 0xf0fff4, 0.78);
      graphics.lineBetween(24, 49, 92, 49);
      graphics.lineBetween(44, 18, 118, 18);
      graphics.generateTexture(OBSTACLE_TEXTURES.gust, 136, 72);
      graphics.destroy();
    }
  }
}

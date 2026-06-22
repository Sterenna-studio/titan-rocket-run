import Phaser from 'phaser';
import { TITAN_DISPLAY_HEIGHT } from '../game/constants';
import type { TitanAnimationManifest } from '../types/game';

export function titanFrameKey(animation: string, index: number): string {
  return `titan:${animation}:${index}`;
}

export function titanAnimKey(animation: string): string {
  return `titan-${animation}`;
}

export function defaultTitanFrame(): string {
  return titanFrameKey('idle', 0);
}

export function queueTitanFrames(scene: Phaser.Scene, manifest: TitanAnimationManifest): number {
  let queued = 0;

  Object.entries(manifest.animations).forEach(([animation, data]) => {
    data.frames.forEach((src, index) => {
      const key = titanFrameKey(animation, index);
      if (!scene.textures.exists(key)) {
        scene.load.image(key, src);
        queued += 1;
      }
    });
  });

  return queued;
}

export function registerTitanAnimations(scene: Phaser.Scene, manifest: TitanAnimationManifest): void {
  Object.entries(manifest.animations).forEach(([animation, data]) => {
    const key = titanAnimKey(animation);
    if (scene.anims.exists(key)) {
      return;
    }

    scene.anims.create({
      key,
      frames: data.frames.map((_, index) => ({ key: titanFrameKey(animation, index) })),
      frameRate: data.fps,
      repeat: data.loop ? -1 : 0,
    });
  });
}

export function scaleTitanSprite(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): void {
  const frame = sprite.frame || scene.textures.getFrame(defaultTitanFrame());
  const sourceHeight = frame?.height || 395;
  sprite.setScale(TITAN_DISPLAY_HEIGHT / sourceHeight);
}

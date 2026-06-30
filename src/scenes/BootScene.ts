import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, MANIFEST_URL } from '../game/constants';
import { queueTitanFrames, registerTitanAnimations } from '../player/TitanAnimations';
import type { TitanAnimationManifest } from '../types/game';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.json('titan-manifest', MANIFEST_URL);
    this.load.image('titan-rocket-projectile', 'assets/effects/titan-rocket-projectile.png');
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07150d).setOrigin(0);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Chargement de Titan...', {
        color: COLORS.text,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        fontStyle: '900',
      })
      .setOrigin(0.5);

    const manifest = this.cache.json.get('titan-manifest') as TitanAnimationManifest | undefined;
    if (!manifest?.animations) {
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 46, 'assets/titan_manifest.json introuvable', {
          color: '#ff7777',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
        })
        .setOrigin(0.5);
      return;
    }

    this.registry.set('titanManifest', manifest);
    const queued = queueTitanFrames(this, manifest);
    const startMenu = () => {
      registerTitanAnimations(this, manifest);
      this.scene.start('MenuScene');
    };

    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, startMenu);
      this.load.start();
    } else {
      startMenu();
    }
  }
}

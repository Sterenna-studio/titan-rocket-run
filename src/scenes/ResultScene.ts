import Phaser from 'phaser';
import { COLORS, CRASH_GROUND_Y, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, GameEvents, SKY_Y, TITAN_BOTTOM_PAD } from '../game/constants';
import { defaultTitanFrame, scaleTitanSprite, titanAnimKey } from '../player/TitanAnimations';
import type { RunSummary } from '../types/game';

export class ResultScene extends Phaser.Scene {
  private summary?: RunSummary;

  private startRun = (): void => {
    this.scene.start('RunScene', { seed: this.makeSeed() });
  };

  constructor() {
    super('ResultScene');
  }

  init(data: { summary?: RunSummary }): void {
    this.summary = data.summary;
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07150d).setOrigin(0);
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0b2112, 1);
    graphics.fillRect(0, SKY_Y + 110, GAME_WIDTH, GAME_HEIGHT - SKY_Y - 110);
    graphics.fillStyle(0x071009, 1);
    graphics.fillRect(0, CRASH_GROUND_Y, GAME_WIDTH, GAME_HEIGHT - CRASH_GROUND_Y);
    graphics.lineStyle(3, COLORS.green, 0.22);
    graphics.lineBetween(0, CRASH_GROUND_Y, GAME_WIDTH, CRASH_GROUND_Y);
    graphics.fillStyle(0x1a2a1c, 1);
    graphics.fillRoundedRect(160, GROUND_Y, 820, 70, 12);
    graphics.lineStyle(3, COLORS.green, 0.36);
    graphics.strokeRoundedRect(160, GROUND_Y, 820, 70, 12);

    const titan = this.add.sprite(420, GROUND_Y + TITAN_BOTTOM_PAD, defaultTitanFrame()).setOrigin(0.5, 1).setDepth(5);
    scaleTitanSprite(this, titan);
    titan.play(titanAnimKey('knockout'));

    const distance = this.summary ? `${this.summary.distance.toFixed(1)} m` : '0 m';
    const title = this.summary?.finishReason === 'space' ? "Perdu dans l'espace" : 'Run terminee';
    this.add
      .text(GAME_WIDTH / 2, GROUND_Y - 88, `${title} - ${distance}`, {
        color: COLORS.text,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: '900',
      })
      .setOrigin(0.5);

    this.game.events.on(GameEvents.StartRun, this.startRun);
    this.input.keyboard?.once('keydown-SPACE', this.startRun);
    this.input.keyboard?.once('keydown-ENTER', this.startRun);
    this.input.keyboard?.once('keydown-R', this.startRun);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GameEvents.StartRun, this.startRun);
    });
  }

  private makeSeed(): string {
    return `run-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}

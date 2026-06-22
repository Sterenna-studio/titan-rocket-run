import Phaser from 'phaser';
import { COLORS, CRASH_GROUND_Y, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, GameEvents, SKY_Y, TITAN_BOTTOM_PAD } from '../game/constants';
import { defaultTitanFrame, scaleTitanSprite, titanAnimKey } from '../player/TitanAnimations';

export class MenuScene extends Phaser.Scene {
  private startRun = (): void => {
    this.scene.start('RunScene', { seed: this.makeSeed() });
  };

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.drawBackdrop();

    const titan = this.add.sprite(270, GROUND_Y + TITAN_BOTTOM_PAD, defaultTitanFrame()).setOrigin(0.5, 1).setDepth(5);
    scaleTitanSprite(this, titan);
    titan.play(titanAnimKey('idle'));

    this.add
      .text(GAME_WIDTH / 2, GROUND_Y - 92, 'Espace ou bouton Jouer pour lancer une run', {
        color: COLORS.muted,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: '700',
      })
      .setOrigin(0.5);

    this.game.events.on(GameEvents.StartRun, this.startRun);
    this.input.keyboard?.once('keydown-SPACE', this.startRun);
    this.input.keyboard?.once('keydown-ENTER', this.startRun);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GameEvents.StartRun, this.startRun);
    });

    this.game.events.emit(GameEvents.MenuReady);
  }

  private drawBackdrop(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07150d).setOrigin(0);
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0b2112, 1);
    graphics.fillRect(0, SKY_Y + 90, GAME_WIDTH, GAME_HEIGHT - SKY_Y - 90);
    graphics.lineStyle(3, COLORS.green, 0.22);
    for (let x = 120; x < GAME_WIDTH + 240; x += 260) {
      const top = SKY_Y - 240 + (x % 3) * 34;
      graphics.strokeRoundedRect(x - 80, top, 160, GROUND_Y - top + 34, 18);
      graphics.fillStyle(COLORS.green, 0.045);
      graphics.fillCircle(x, top + 28, 112);
    }
    graphics.fillStyle(0x071009, 1);
    graphics.fillRect(0, CRASH_GROUND_Y, GAME_WIDTH, GAME_HEIGHT - CRASH_GROUND_Y);
    graphics.lineStyle(3, COLORS.green, 0.24);
    graphics.lineBetween(0, CRASH_GROUND_Y, GAME_WIDTH, CRASH_GROUND_Y);
    graphics.fillStyle(0x1a2a1c, 1);
    graphics.fillRoundedRect(80, GROUND_Y, 980, 70, 12);
    graphics.lineStyle(3, COLORS.green, 0.42);
    graphics.strokeRoundedRect(80, GROUND_Y, 980, 70, 12);
  }

  private makeSeed(): string {
    return `run-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}

import Phaser from 'phaser';
import { COLORS, CRASH_GROUND_Y, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, GameEvents, SKY_Y, TITAN_BOTTOM_PAD } from '../game/constants';
import { defaultTitanFrame, scaleTitanSprite, titanAnimKey } from '../player/TitanAnimations';
import { controlSettings } from '../systems/ControlSettings';

export class MenuScene extends Phaser.Scene {
  private chargeGraphics!: Phaser.GameObjects.Graphics;
  private chargeText!: Phaser.GameObjects.Text;
  private charging = false;
  private chargeStart = 0;
  private started = false;

  private startRun = (launchPower = 0.42, unstable = false): void => {
    if (this.started) {
      return;
    }

    this.started = true;
    this.scene.start('RunScene', { seed: this.makeSeed(), launchPower, launchUnstable: unstable });
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
      .text(GAME_WIDTH / 2, GROUND_Y - 104, 'Maintiens Espace 1 seconde, relache dans la zone verte', {
        color: COLORS.muted,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: '700',
      })
      .setOrigin(0.5);
    this.chargeGraphics = this.add.graphics().setDepth(7);
    this.chargeText = this.add
      .text(GAME_WIDTH / 2, GROUND_Y - 68, 'Bouton Jouer = depart normal', {
        color: COLORS.text,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '17px',
        fontStyle: '900',
      })
      .setOrigin(0.5)
      .setDepth(8);
    this.drawChargeMeter(0);

    this.game.events.on(GameEvents.StartRun, this.startRun);
    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.input.keyboard?.on('keyup', this.handleKeyUp, this);
    this.input.keyboard?.once('keydown-ENTER', () => this.startRun());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GameEvents.StartRun, this.startRun);
      this.input.keyboard?.off('keydown', this.handleKeyDown, this);
      this.input.keyboard?.off('keyup', this.handleKeyUp, this);
    });

    this.game.events.emit(GameEvents.MenuReady);
  }

  update(): void {
    if (!this.charging || this.started) {
      return;
    }

    const elapsed = (this.time.now - this.chargeStart) / 1000;
    const ratio = Math.min(1.35, elapsed / 1.12);
    this.drawChargeMeter(ratio);
    if (ratio >= 1.28) {
      this.releaseCharge();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (controlSettings.matches('jump', event.code)) {
      this.beginCharge(event);
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (controlSettings.matches('jump', event.code)) {
      this.releaseCharge(event);
    }
  }

  private beginCharge(event?: KeyboardEvent): void {
    if (this.started || this.charging || event?.repeat) {
      return;
    }

    event?.preventDefault();
    this.charging = true;
    this.chargeStart = this.time.now;
    this.chargeText.setText('Charge...');
    this.drawChargeMeter(0);
  }

  private releaseCharge(event?: KeyboardEvent): void {
    if (!this.charging || this.started) {
      return;
    }

    event?.preventDefault();
    this.charging = false;
    const elapsed = (this.time.now - this.chargeStart) / 1000;
    const ratio = elapsed / 1.12;
    const perfect = ratio >= 0.58 && ratio <= 0.84;
    const unstable = ratio > 1.04;
    const launchPower = perfect ? 1 : unstable ? 0.88 : Math.max(0.24, Math.min(0.74, ratio));
    this.drawChargeMeter(ratio);
    this.chargeText.setText(perfect ? 'Depart parfait !' : unstable ? 'Depart puissant instable !' : 'Depart normal');
    this.startRun(launchPower, unstable);
  }

  private drawChargeMeter(ratio: number): void {
    const x = GAME_WIDTH / 2 - 260;
    const y = GROUND_Y - 42;
    const width = 520;
    const height = 22;
    const fill = Math.min(1, Math.max(0, ratio));
    const perfectX = x + width * 0.58;
    const perfectW = width * 0.26;

    this.chargeGraphics.clear();
    this.chargeGraphics.fillStyle(0x030806, 0.84);
    this.chargeGraphics.fillRoundedRect(x, y, width, height, 10);
    this.chargeGraphics.fillStyle(0x62ff52, 0.24);
    this.chargeGraphics.fillRoundedRect(perfectX, y + 3, perfectW, height - 6, 8);
    this.chargeGraphics.fillStyle(ratio > 1.04 ? 0xff5b46 : ratio >= 0.58 && ratio <= 0.84 ? 0x62ff52 : 0xffd36a, 0.92);
    this.chargeGraphics.fillRoundedRect(x, y, width * fill, height, 10);
    this.chargeGraphics.lineStyle(3, COLORS.green, 0.42);
    this.chargeGraphics.strokeRoundedRect(x, y, width, height, 10);
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

import Phaser from 'phaser';
import { COLORS, CRASH_GROUND_Y, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, GameEvents, SKY_Y, TITAN_BOTTOM_PAD } from '../game/constants';
import { defaultTitanFrame, scaleTitanSprite, titanAnimKey } from '../player/TitanAnimations';
import { controlSettings } from '../systems/ControlSettings';
import type { RunSummary } from '../types/game';

export class ResultScene extends Phaser.Scene {
  private summary?: RunSummary;
  private distanceLine?: Phaser.GameObjects.Text;
  private bonesLine?: Phaser.GameObjects.Text;
  private signalLine?: Phaser.GameObjects.Text;
  private comboLine?: Phaser.GameObjects.Text;
  private rewardLine?: Phaser.GameObjects.Text;
  private recordLine?: Phaser.GameObjects.Text;
  private replayLine?: Phaser.GameObjects.Text;
  private progressStart = 0;
  private readonly progressDuration = 1500;

  private startRun = (): void => {
    this.scene.start('RunScene', { seed: this.makeSeed(), launchPower: 0.42 });
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
    graphics.fillRoundedRect(GAME_WIDTH / 2 - 410, GROUND_Y, 820, 70, 12);
    graphics.lineStyle(3, COLORS.green, 0.36);
    graphics.strokeRoundedRect(GAME_WIDTH / 2 - 410, GROUND_Y, 820, 70, 12);

    const titan = this.add.sprite(GAME_WIDTH / 2, GROUND_Y + TITAN_BOTTOM_PAD, defaultTitanFrame()).setOrigin(0.5, 1).setDepth(5);
    scaleTitanSprite(this, titan);
    titan.play(titanAnimKey('knockout'));

    this.createResultPopup();
    this.progressStart = this.time.now;
    this.renderProgress(0);

    this.game.events.on(GameEvents.StartRun, this.startRun);
    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GameEvents.StartRun, this.startRun);
      this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    });
  }

  update(): void {
    const progress = Math.min(1, (this.time.now - this.progressStart) / this.progressDuration);
    this.renderProgress(1 - Math.pow(1 - progress, 3));
  }

  private createResultPopup(): void {
    const popup = this.add.container(GAME_WIDTH / 2, GROUND_Y - 310).setDepth(30).setAlpha(0);
    const card = this.add.graphics();
    card.fillStyle(0x061009, 0.94);
    card.fillRoundedRect(-390, -196, 780, 360, 26);
    card.fillStyle(0x62ff52, 0.08);
    card.fillRoundedRect(-372, -178, 744, 324, 20);
    card.lineStyle(4, COLORS.green, 0.62);
    card.strokeRoundedRect(-390, -196, 780, 360, 26);
    card.fillStyle(0x061009, 0.94);
    card.fillTriangle(-38, 164, 38, 164, 0, 216);
    card.lineStyle(3, COLORS.green, 0.42);
    card.lineBetween(-38, 164, 0, 216);
    card.lineBetween(38, 164, 0, 216);
    popup.add(card);

    const title = this.summary?.isRecord ? 'Nouveau record !' : 'Run terminee';
    popup.add(
      this.add
        .text(0, -148, title, {
          align: 'center',
          color: this.summary?.isRecord ? '#ffd36a' : COLORS.greenText,
          fontFamily: 'system-ui, sans-serif',
          fontSize: '38px',
          fontStyle: '900',
        })
        .setOrigin(0.5),
    );

    const badge = this.summary?.badge || (this.summary?.storyEvents ? 'Route decouverte' : 'Titan revient au garage');
    popup.add(
      this.add
        .text(0, -106, badge, {
          align: 'center',
          color: COLORS.muted,
          fontFamily: 'system-ui, sans-serif',
          fontSize: '22px',
          fontStyle: '800',
        })
        .setOrigin(0.5),
    );

    this.distanceLine = this.createLine(popup, -118, -44);
    this.bonesLine = this.createLine(popup, 118, -44);
    this.signalLine = this.createLine(popup, -118, 22);
    this.comboLine = this.createLine(popup, 118, 22);
    this.rewardLine = this.createLine(popup, -118, 88, '#62ff52');
    this.recordLine = this.createLine(popup, 118, 88, '#ffd36a');
    this.replayLine = this.add
      .text(0, 136, 'Comptage...', {
        color: COLORS.text,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: '900',
      })
      .setOrigin(0.5);
    popup.add(this.replayLine);

    this.tweens.add({
      targets: popup,
      alpha: 1,
      y: popup.y - 24,
      duration: 360,
      ease: 'Cubic.Out',
    });
  }

  private createLine(container: Phaser.GameObjects.Container, x: number, y: number, color = COLORS.text): Phaser.GameObjects.Text {
    const line = this.add
      .text(x, y, '', {
        align: x < 0 ? 'left' : 'right',
        color,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: '900',
      })
      .setOrigin(x < 0 ? 0 : 1, 0.5);
    container.add(line);
    return line;
  }

  private renderProgress(progress: number): void {
    const summary = this.getSummary();
    this.distanceLine?.setText(`Distance\n${(summary.distance * progress).toFixed(1)} m`);
    this.bonesLine?.setText(`Os ramasses\n${Math.round(summary.pickups * progress)} (+${Math.round(summary.bonusBones * progress)})`);
    this.signalLine?.setText(`Bonus lieux\n${Math.round(summary.storyEvents * progress)} signal(s)`);
    this.comboLine?.setText(`Combo max\nx${Math.round(summary.bestCombo * progress)}`);
    this.rewardLine?.setText(`Total gagne\n+${Math.round(summary.reward * progress)} os`);
    this.recordLine?.setText(summary.isRecord ? 'Record\nvalide' : `Record\n${summary.badge || 'a battre'}`);
    this.replayLine?.setText(progress >= 1 ? 'Enter / Espace / R pour rejouer' : 'Comptage...');
  }

  private getSummary(): RunSummary {
    return this.summary ?? {
      distance: 0,
      maxSpeed: 0,
      jumps: 0,
      landed: 0,
      pickups: 0,
      bonusBones: 0,
      overdrives: 0,
      combo: 0,
      bestCombo: 0,
      storyEvents: 0,
      bestMilestone: '',
      milestonesReached: [],
      reward: 0,
      isRecord: false,
      badge: '',
      seed: '',
      finishReason: 'fall',
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Enter' || controlSettings.matches('jump', event.code) || controlSettings.matches('restart', event.code)) {
      event.preventDefault();
      this.startRun();
    }
  }

  private makeSeed(): string {
    return `run-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}

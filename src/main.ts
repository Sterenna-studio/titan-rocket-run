import Phaser from 'phaser';
import './style.css';
import { createGameConfig } from './game/config';
import { GameEvents } from './game/constants';
import { leaderboardSystem } from './systems/LeaderboardSystem';
import { saveSystem } from './systems/SaveSystem';
import { soundSystem } from './systems/SoundSystem';
import { upgradeSystem } from './systems/UpgradeSystem';
import type { HudState, LeaderboardEntry, RunSummary, SaveData, UiMessage, UpgradeId, VirtualInput } from './types/game';

type ButtonEl = HTMLButtonElement;

const game = new Phaser.Game(createGameConfig());

const ui = {
  best: byId('bestDistance'),
  coins: byId('coins'),
  leaderboard: byId('leaderboard'),
  shop: byId('shop'),
  msg: byId('message'),
  speedMeter: byId('speedMeter') as HTMLMeterElement,
  speedText: byId('speedText'),
  timingMeter: byId('timingMeter') as HTMLMeterElement,
  timingText: byId('timingText'),
  rocketMeter: byId('rocketMeter') as HTMLMeterElement,
  rocketText: byId('rocketText'),
  missileMeter: byId('missileMeter') as HTMLMeterElement,
  missileText: byId('missileText'),
  resetSave: byId('resetSave') as ButtonEl,
  muteBtn: byId('muteBtn') as ButtonEl,
  overlay: byId('overlay'),
  titleScreen: byId('titleScreen'),
  resultScreen: byId('resultScreen'),
  playBtn: byId('playBtn') as ButtonEl,
  retryBtn: byId('retryBtn') as ButtonEl,
  resTitle: byId('resTitle'),
  resScore: byId('resScore'),
  resDist: byId('resDist'),
  resSpeed: byId('resSpeed'),
  resJump: byId('resJump'),
  resBones: byId('resBones'),
  resDodges: byId('resDodges'),
  resOverdrives: byId('resOverdrives'),
  resHits: byId('resHits'),
  resReward: byId('resReward'),
  resBadge: byId('resBadge'),
  scoreForm: byId('scoreForm') as HTMLFormElement,
  scoreName: byId('scoreName') as HTMLInputElement,
  scoreSubmit: byId('scoreSubmit') as ButtonEl,
};

let soundMuted = false;
let latestSummary: RunSummary | null = null;
let scoreSubmitted = false;

renderLeaderboard();
renderSave(saveSystem.getSnapshot());
renderMessage({
  title: 'Pret ?',
  body: "Charge ton depart, poursuis les signaux de Titan et empile les combos d'os.",
});

ui.playBtn.addEventListener('click', () => requestStart());
ui.retryBtn.addEventListener('click', () => requestStart());
ui.scoreName.addEventListener('input', () => {
  ui.scoreName.value = ui.scoreName.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
  updateScoreSubmitState();
});
ui.scoreForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitArcadeScore();
});
ui.resetSave.addEventListener('click', () => {
  if (!window.confirm('Supprimer la sauvegarde Titan Rocket Run ?')) {
    return;
  }

  renderSave(saveSystem.reset());
  game.events.emit(GameEvents.SaveChanged, saveSystem.getSnapshot());
  renderMessage({ title: 'Sauvegarde reset', body: 'Record, os et upgrades remis a zero.' });
});
ui.muteBtn.addEventListener('click', () => {
  soundMuted = !soundMuted;
  soundSystem.setMuted(soundMuted);
  if (!soundMuted) {
    soundSystem.unlock();
  }
  game.sound.mute = soundMuted;
  ui.muteBtn.textContent = soundMuted ? 'Muet' : 'Son';
  ui.muteBtn.setAttribute('aria-pressed', String(soundMuted));
  ui.muteBtn.blur();
});

game.events.on(GameEvents.MenuReady, showTitle);
game.events.on(GameEvents.RunStarted, hideOverlay);
game.events.on(GameEvents.RunFinished, showResult);
game.events.on(GameEvents.HudUpdate, updateHud);
game.events.on(GameEvents.Message, renderMessage);
game.events.on(GameEvents.SaveChanged, (save: SaveData) => renderSave(save));

bindTouchControls();
bindAudioUnlock();

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing DOM element #${id}`);
  }
  return element;
}

function requestStart(): void {
  soundSystem.unlock();
  game.events.emit(GameEvents.StartRun);
  ui.playBtn.blur();
  ui.retryBtn.blur();
}

function showTitle(): void {
  ui.titleScreen.classList.remove('hidden');
  ui.resultScreen.classList.add('hidden');
  ui.overlay.classList.remove('hidden');
}

function hideOverlay(): void {
  ui.overlay.classList.add('hidden');
  ui.titleScreen.classList.add('hidden');
  ui.resultScreen.classList.add('hidden');
}

function showResult(summary: RunSummary): void {
  latestSummary = summary;
  scoreSubmitted = false;
  renderSave(saveSystem.getSnapshot());
  renderLeaderboard();
  ui.titleScreen.classList.add('hidden');
  ui.resultScreen.classList.remove('hidden');
  ui.overlay.classList.remove('hidden');
  ui.resScore.textContent = formatScore(leaderboardSystem.calculateScore(summary));
  ui.resDist.textContent = `${summary.distance.toFixed(1)} m`;
  ui.resSpeed.textContent = `${Math.round(summary.maxSpeed)}`;
  ui.resJump.textContent = `${summary.jumps}`;
  ui.resBones.textContent = `${summary.pickups} (+${summary.bonusBones})`;
  ui.resDodges.textContent = `${summary.riskDodges}`;
  ui.resOverdrives.textContent = `${summary.overdrives}`;
  ui.resHits.textContent = `${summary.hits}`;
  ui.resReward.textContent = `+${summary.reward}`;
  ui.resTitle.textContent =
    summary.finishReason === 'space' ? "Perdu dans l'espace" : summary.isRecord ? 'Nouveau record !' : 'Run termine';
  const badge = summary.storyEvents > 0 ? `${summary.badge || 'Route decouverte'} - ${summary.storyEvents} signal(s)` : summary.badge;
  ui.resBadge.textContent = badge;
  ui.resBadge.classList.toggle('hidden', !badge);
  ui.scoreForm.classList.remove('hidden');
  ui.scoreSubmit.textContent = 'Inscrire';
  updateScoreSubmitState();
}

function updateHud(hud: HudState): void {
  ui.speedMeter.value = hud.speedPercent;
  ui.speedText.textContent = `${Math.round(hud.speedPercent)}%`;
  ui.timingMeter.value = Math.max(0, Math.min(100, (hud.jumpsLeft / hud.maxJumps) * 100));
  ui.timingText.textContent = `${hud.jumpsLeft}/${hud.maxJumps}`;
  ui.rocketMeter.value = hud.rocketPercent;
  ui.rocketText.textContent = `${Math.round(hud.rocketPercent)}%`;
  ui.missileMeter.value = hud.missilePercent;
  ui.missileText.textContent = hud.missileUnlocked ? (hud.missilePercent >= 100 ? 'OK' : `${Math.round(hud.missilePercent)}%`) : 'LOCK';
}

function renderMessage(message: UiMessage): void {
  const title = document.createElement('b');
  title.textContent = message.title;
  ui.msg.replaceChildren(title, document.createElement('br'), document.createTextNode(message.body));
}

function renderSave(save: SaveData): void {
  ui.best.textContent = `${save.best.toFixed(1)} m`;
  ui.coins.textContent = `${save.coins}`;
  renderShop();
}

function renderLeaderboard(highlightId = ''): void {
  ui.leaderboard.replaceChildren(...leaderboardSystem.getEntries().map((entry, index) => createLeaderboardRow(entry, index + 1, highlightId)));
}

function createLeaderboardRow(entry: LeaderboardEntry, rank: number, highlightId: string): HTMLElement {
  const row = document.createElement('li');
  row.classList.toggle('isLocal', entry.source === 'local');
  row.classList.toggle('isHighlight', entry.id === highlightId);
  row.title = `${entry.distance} m - combo x${entry.combo}`;

  const rankEl = document.createElement('span');
  rankEl.textContent = `${rank}.`;

  const nameEl = document.createElement('span');
  nameEl.className = 'leaderboardName';
  nameEl.textContent = entry.name;

  const scoreEl = document.createElement('span');
  scoreEl.className = 'leaderboardScore';
  scoreEl.textContent = formatScore(entry.score);

  row.append(rankEl, nameEl, scoreEl);
  return row;
}

function renderShop(): void {
  ui.shop.replaceChildren(...upgradeSystem.getShopItems().map((item) => {
    const card = document.createElement('div');
    card.className = 'item';

    const top = document.createElement('div');
    top.className = 'itemTop';

    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = item.name;
    const desc = document.createElement('small');
    desc.textContent = item.desc;
    copy.append(title, desc);

    const level = document.createElement('b');
    level.textContent = `Niv. ${item.level}/${item.max}`;
    top.append(copy, level);

    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = !item.canBuy;
    button.textContent = item.isMaxed ? 'MAX' : `Acheter - ${item.cost} os`;
    button.addEventListener('click', () => buyUpgrade(item.id));

    card.append(top, button);
    return card;
  }));
}

function buyUpgrade(id: UpgradeId): void {
  if (!upgradeSystem.buy(id)) {
    return;
  }

  const save = saveSystem.getSnapshot();
  soundSystem.upgrade();
  renderSave(save);
  game.events.emit(GameEvents.SaveChanged, save);
  renderMessage({ title: 'Upgrade achete', body: 'Les stats de Titan seront appliquees a la prochaine run.' });
}

function submitArcadeScore(): void {
  if (!latestSummary || scoreSubmitted) {
    return;
  }

  const entry = leaderboardSystem.submitLocalScore(ui.scoreName.value, latestSummary);
  if (!entry) {
    updateScoreSubmitState();
    return;
  }

  scoreSubmitted = true;
  ui.scoreSubmit.textContent = 'Inscrit';
  ui.scoreSubmit.disabled = true;
  renderLeaderboard(entry.id);
  renderMessage({
    title: 'Score inscrit',
    body: `${entry.name} entre au leaderboard arcade avec ${formatScore(entry.score)} points.`,
  });
}

function updateScoreSubmitState(): void {
  ui.scoreSubmit.disabled = scoreSubmitted || !latestSummary || !leaderboardSystem.normalizeInitials(ui.scoreName.value);
}

function formatScore(score: number): string {
  return Math.round(score).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function bindAudioUnlock(): void {
  const unlock = () => soundSystem.unlock();
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function bindTouchControls(): void {
  const keyMap: Record<string, VirtualInput['key']> = {
    a: 'a',
    d: 'd',
    space: 'space',
    shift: 'shift',
    missile: 'missile',
    r: 'r',
  };

  document.querySelectorAll<HTMLButtonElement>('.touchBtn').forEach((button) => {
    const rawKey = button.dataset.key;
    const key = rawKey ? keyMap[rawKey] : undefined;
    if (!key) {
      return;
    }

    const emit = (down: boolean) => {
      const payload: VirtualInput = { key, down };
      game.events.emit(GameEvents.VirtualInput, payload);
    };
    const release = (event: PointerEvent) => {
      event.preventDefault();
      emit(false);
      button.classList.remove('isPressed');
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('isPressed');
      emit(true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', (event) => {
      if (button.classList.contains('isPressed')) {
        release(event);
      }
    });
  });
}

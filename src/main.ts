import Phaser from 'phaser';
import './style.css';
import { createGameConfig } from './game/config';
import { GameEvents } from './game/constants';
import { controlSettings, type ControlAction } from './systems/ControlSettings';
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
  runs: byId('runCount'),
  signals: byId('signalCount'),
  leaderboard: byId('leaderboard'),
  shop: byId('shop'),
  msg: byId('message'),
  speedMeter: byId('speedMeter') as HTMLMeterElement,
  speedText: byId('speedText'),
  timingMeter: byId('timingMeter') as HTMLMeterElement,
  timingText: byId('timingText'),
  rocketMeter: byId('rocketMeter') as HTMLMeterElement,
  rocketText: byId('rocketText'),
  resetSave: byId('resetSave') as ButtonEl,
  controlReset: byId('controlReset') as ButtonEl,
  muteBtn: byId('muteBtn') as ButtonEl,
  overlay: byId('overlay'),
  snikyIntro: byId('snikyIntro'),
  snikyClose: byId('snikyClose') as ButtonEl,
  snikySkipForever: byId('snikySkipForever') as ButtonEl,
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
  resLandings: byId('resLandings'),
  resOverdrives: byId('resOverdrives'),
  resSignals: byId('resSignals'),
  resReward: byId('resReward'),
  resBadge: byId('resBadge'),
  scoreForm: byId('scoreForm') as HTMLFormElement,
  scoreName: byId('scoreName') as HTMLInputElement,
  scoreSubmit: byId('scoreSubmit') as ButtonEl,
};

let soundMuted = false;
let latestSummary: RunSummary | null = null;
let scoreSubmitted = false;
let resultAnimationId: number | null = null;
let pendingControlAction: ControlAction | null = null;

renderLeaderboard();
renderSave(saveSystem.getSnapshot());
renderControlBindings();
renderMessage({
  title: 'Nouvelle save V1',
  body: 'Sniky t attend avec 130 os de depart. Choisis un premier upgrade puis suis les signaux bretons.',
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
  renderMessage({ title: 'Sauvegarde V1 reset', body: 'Sniky remet Titan au depart avec 130 os et une progression propre.' });
  showSnikyIntroIfNeeded();
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
ui.snikyClose.addEventListener('click', () => {
  renderSave(saveSystem.markWelcomeSeen());
  hideSnikyIntro();
});
ui.snikySkipForever.addEventListener('click', () => {
  hideSnikyIntro();
});

game.events.on(GameEvents.MenuReady, showTitle);
game.events.on(GameEvents.RunStarted, hideOverlay);
game.events.on(GameEvents.RunFinished, showResult);
game.events.on(GameEvents.HudUpdate, updateHud);
game.events.on(GameEvents.Message, renderMessage);
game.events.on(GameEvents.SaveChanged, (save: SaveData) => renderSave(save));

bindTouchControls();
bindControlConfig();
bindAudioUnlock();
showSnikyIntroIfNeeded();

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
  ui.overlay.classList.remove('isResult');
  ui.titleScreen.classList.remove('hidden');
  ui.resultScreen.classList.add('hidden');
  ui.overlay.classList.remove('hidden');
}

function hideOverlay(): void {
  ui.overlay.classList.remove('isResult');
  ui.overlay.classList.add('hidden');
  ui.titleScreen.classList.add('hidden');
  ui.resultScreen.classList.add('hidden');
}

function showResult(summary: RunSummary): void {
  if (resultAnimationId !== null) {
    window.cancelAnimationFrame(resultAnimationId);
    resultAnimationId = null;
  }

  latestSummary = summary;
  scoreSubmitted = false;
  renderSave(saveSystem.getSnapshot());
  renderLeaderboard();
  ui.overlay.classList.add('isResult');
  ui.titleScreen.classList.add('hidden');
  ui.resultScreen.classList.remove('hidden');
  ui.overlay.classList.remove('hidden');
  ui.resTitle.textContent = summary.isRecord ? 'Nouveau record !' : 'Run termine';
  ui.resBadge.classList.add('hidden');
  ui.scoreForm.classList.add('hidden');
  ui.scoreSubmit.textContent = 'Inscrire';
  renderResultProgress(summary, 0);
  animateResult(summary);
}

function animateResult(summary: RunSummary): void {
  const duration = 1300;
  const start = window.performance.now();

  const tick = (now: number) => {
    const raw = Math.min(1, (now - start) / duration);
    const progress = 1 - Math.pow(1 - raw, 3);
    renderResultProgress(summary, progress);

    if (raw < 1) {
      resultAnimationId = window.requestAnimationFrame(tick);
      return;
    }

    resultAnimationId = null;
    renderResultProgress(summary, 1);
    const badge = summary.storyEvents > 0 ? `${summary.badge || 'Route decouverte'} - ${summary.storyEvents} signal(s)` : summary.badge;
    ui.resBadge.textContent = badge;
    ui.resBadge.classList.toggle('hidden', !badge);
    ui.scoreForm.classList.remove('hidden');
    updateScoreSubmitState();
  };

  resultAnimationId = window.requestAnimationFrame(tick);
}

function renderResultProgress(summary: RunSummary, progress: number): void {
  const score = leaderboardSystem.calculateScore(summary);
  ui.resScore.textContent = formatScore(score * progress);
  ui.resDist.textContent = `${(summary.distance * progress).toFixed(1)} m`;
  ui.resSpeed.textContent = `${Math.round(summary.maxSpeed * progress)}`;
  ui.resJump.textContent = `${Math.round(summary.jumps * progress)}`;
  ui.resBones.textContent = `${Math.round(summary.pickups * progress)} (+${Math.round(summary.bonusBones * progress)})`;
  ui.resLandings.textContent = `${Math.round(summary.landed * progress)}`;
  ui.resOverdrives.textContent = `${Math.round(summary.overdrives * progress)}`;
  ui.resSignals.textContent = `${Math.round(summary.storyEvents * progress)}`;
  ui.resReward.textContent = `+${Math.round(summary.reward * progress)}`;
}

function updateHud(hud: HudState): void {
  ui.speedMeter.value = hud.speedPercent;
  ui.speedText.textContent = `${Math.round(hud.speedPercent)}%`;
  ui.timingMeter.value = Math.max(0, Math.min(100, (hud.jumpsLeft / hud.maxJumps) * 100));
  ui.timingText.textContent = `${hud.jumpsLeft}/${hud.maxJumps}`;
  ui.rocketMeter.value = hud.rocketPercent;
  ui.rocketText.textContent = `${Math.round(hud.rocketPercent)}%`;
}

function showSnikyIntroIfNeeded(): void {
  if (saveSystem.getSnapshot().welcomeSeen) {
    return;
  }

  ui.snikyIntro.classList.remove('hidden');
  ui.snikyClose.focus({ preventScroll: true });
}

function hideSnikyIntro(): void {
  ui.snikyIntro.classList.add('hidden');
  ui.playBtn.focus({ preventScroll: true });
}

function renderMessage(message: UiMessage): void {
  const title = document.createElement('b');
  title.textContent = message.title;
  ui.msg.replaceChildren(title, document.createElement('br'), document.createTextNode(message.body));
}

function renderSave(save: SaveData): void {
  ui.best.textContent = `${save.best.toFixed(1)} m`;
  ui.coins.textContent = `${save.coins}`;
  ui.runs.textContent = `${save.runs}`;
  ui.signals.textContent = `${Object.values(save.milestones).filter(Boolean).length}`;
  renderShop();
}

function bindControlConfig(): void {
  document.querySelectorAll<HTMLButtonElement>('.bindBtn[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = getControlAction(button.dataset.action);
      if (!action) {
        return;
      }

      pendingControlAction = action;
      renderControlBindings();
      button.blur();
    });
  });

  ui.controlReset.addEventListener('click', () => {
    pendingControlAction = null;
    controlSettings.reset();
    renderControlBindings();
    renderMessage({ title: 'Touches reset', body: 'Le clavier revient aux controles V1 par defaut.' });
    ui.controlReset.blur();
  });

  window.addEventListener(
    'keydown',
    (event) => {
      if (!pendingControlAction) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      const action = pendingControlAction;
      controlSettings.setPrimary(action, event.code, event.key);
      pendingControlAction = null;
      renderControlBindings();
      renderMessage({ title: 'Touche modifiee', body: `${getControlActionLabel(action)} : ${controlSettings.getLabel(action)}.` });
    },
    true,
  );
}

function renderControlBindings(): void {
  document.querySelectorAll<HTMLButtonElement>('.bindBtn[data-action]').forEach((button) => {
    const action = getControlAction(button.dataset.action);
    if (!action) {
      return;
    }

    button.classList.toggle('isListening', pendingControlAction === action);
    const label = button.querySelector<HTMLElement>('[data-bind-label]');
    if (label) {
      label.textContent = pendingControlAction === action ? 'Appuie touche' : controlSettings.getLabel(action);
    }
  });
}

function getControlAction(value: string | undefined): ControlAction | undefined {
  if (value === 'left' || value === 'right' || value === 'jump' || value === 'rocket' || value === 'pause' || value === 'restart') {
    return value;
  }

  return undefined;
}

function getControlActionLabel(action: ControlAction): string {
  return {
    left: 'Gauche',
    right: 'Droite',
    jump: 'Saut',
    rocket: 'Rocket',
    pause: 'Pause',
    restart: 'Retry',
  }[action];
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
    pause: 'pause',
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

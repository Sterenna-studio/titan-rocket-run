import Phaser from 'phaser';
import './style.css';
import { createGameConfig } from './game/config';
import { GameEvents } from './game/constants';
import { saveSystem } from './systems/SaveSystem';
import { soundSystem } from './systems/SoundSystem';
import { upgradeSystem } from './systems/UpgradeSystem';
import type { HudState, RunSummary, SaveData, UiMessage, UpgradeId, VirtualInput } from './types/game';

type ButtonEl = HTMLButtonElement;

const game = new Phaser.Game(createGameConfig());

const ui = {
  best: byId('bestDistance'),
  coins: byId('coins'),
  shop: byId('shop'),
  msg: byId('message'),
  speedMeter: byId('speedMeter') as HTMLMeterElement,
  speedText: byId('speedText'),
  timingMeter: byId('timingMeter') as HTMLMeterElement,
  timingText: byId('timingText'),
  rocketMeter: byId('rocketMeter') as HTMLMeterElement,
  rocketText: byId('rocketText'),
  resetSave: byId('resetSave') as ButtonEl,
  muteBtn: byId('muteBtn') as ButtonEl,
  overlay: byId('overlay'),
  titleScreen: byId('titleScreen'),
  resultScreen: byId('resultScreen'),
  playBtn: byId('playBtn') as ButtonEl,
  retryBtn: byId('retryBtn') as ButtonEl,
  resTitle: byId('resTitle'),
  resDist: byId('resDist'),
  resSpeed: byId('resSpeed'),
  resJump: byId('resJump'),
  resBones: byId('resBones'),
  resHits: byId('resHits'),
  resReward: byId('resReward'),
  resBadge: byId('resBadge'),
};

let soundMuted = false;

renderSave(saveSystem.getSnapshot());
renderMessage({
  title: 'Pret ?',
  body: "Platformer runner : garde l'elan, enchaine les plateformes, utilise les doubles sauts et la rocket.",
});

ui.playBtn.addEventListener('click', () => requestStart());
ui.retryBtn.addEventListener('click', () => requestStart());
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
  renderSave(saveSystem.getSnapshot());
  ui.titleScreen.classList.add('hidden');
  ui.resultScreen.classList.remove('hidden');
  ui.overlay.classList.remove('hidden');
  ui.resDist.textContent = `${summary.distance.toFixed(1)} m`;
  ui.resSpeed.textContent = `${Math.round(summary.maxSpeed)}`;
  ui.resJump.textContent = `${summary.jumps}`;
  ui.resBones.textContent = `${summary.pickups} (+${summary.bonusBones})`;
  ui.resHits.textContent = `${summary.hits}`;
  ui.resReward.textContent = `+${summary.reward}`;
  ui.resTitle.textContent = summary.isRecord ? 'Nouveau record !' : 'Run termine';
  ui.resBadge.textContent = summary.badge;
  ui.resBadge.classList.toggle('hidden', !summary.badge);
}

function updateHud(hud: HudState): void {
  ui.speedMeter.value = hud.speedPercent;
  ui.speedText.textContent = `${Math.round(hud.speedPercent)}%`;
  ui.timingMeter.value = Math.max(0, Math.min(100, (hud.jumpsLeft / hud.maxJumps) * 100));
  ui.timingText.textContent = `${hud.jumpsLeft}/${hud.maxJumps}`;
  ui.rocketMeter.value = hud.rocketPercent;
  ui.rocketText.textContent = `${Math.round(hud.rocketPercent)}%`;
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

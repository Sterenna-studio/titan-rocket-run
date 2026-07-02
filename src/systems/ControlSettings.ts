export type ControlAction = 'left' | 'right' | 'jump' | 'rocket' | 'restart';

export interface ControlBinding {
  code: string;
  label: string;
}

export type ControlBindings = Record<ControlAction, ControlBinding[]>;

const STORAGE_KEY = 'titanRocketRunControlsV1';

const DEFAULT_BINDINGS: ControlBindings = {
  left: [
    { code: 'KeyA', label: 'A' },
    { code: 'KeyQ', label: 'Q' },
    { code: 'ArrowLeft', label: '←' },
  ],
  right: [
    { code: 'KeyD', label: 'D' },
    { code: 'ArrowRight', label: '→' },
  ],
  jump: [{ code: 'Space', label: 'Espace' }],
  rocket: [
    { code: 'ShiftLeft', label: 'Shift' },
    { code: 'ShiftRight', label: 'Shift' },
  ],
  restart: [{ code: 'KeyR', label: 'R' }],
};

const ACTIONS: ControlAction[] = ['left', 'right', 'jump', 'rocket', 'restart'];

function cloneBindings(bindings: ControlBindings): ControlBindings {
  return {
    left: [...bindings.left],
    right: [...bindings.right],
    jump: [...bindings.jump],
    rocket: [...bindings.rocket],
    restart: [...bindings.restart],
  };
}

function normalizeCodeLabel(code: string, fallback: string): string {
  if (code === 'Space') {
    return 'Espace';
  }
  if (code.startsWith('Key')) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code.startsWith('Arrow')) {
    return code === 'ArrowLeft' ? '←' : code === 'ArrowRight' ? '→' : code.replace('Arrow', '');
  }

  return fallback.length === 1 ? fallback.toUpperCase() : fallback;
}

class ControlSettings {
  private bindings: ControlBindings = this.load();

  getBindings(): ControlBindings {
    return cloneBindings(this.bindings);
  }

  getLabel(action: ControlAction): string {
    return this.bindings[action].map((binding) => binding.label).join(' / ');
  }

  matches(action: ControlAction, code: string): boolean {
    return this.bindings[action].some((binding) => binding.code === code);
  }

  setPrimary(action: ControlAction, code: string, key: string): ControlBindings {
    const label = normalizeCodeLabel(code, key);
    const extras = DEFAULT_BINDINGS[action].filter((binding) => binding.code !== code);
    this.bindings[action] = [{ code, label }, ...extras].slice(0, 3);
    this.save();
    return this.getBindings();
  }

  reset(): ControlBindings {
    this.bindings = cloneBindings(DEFAULT_BINDINGS);
    this.save();
    return this.getBindings();
  }

  private load(): ControlBindings {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return cloneBindings(DEFAULT_BINDINGS);
      }

      const parsed = JSON.parse(raw) as Partial<ControlBindings>;
      const bindings = cloneBindings(DEFAULT_BINDINGS);
      for (const action of ACTIONS) {
        const custom = parsed[action];
        if (Array.isArray(custom) && custom.length > 0) {
          bindings[action] = custom
            .filter((binding) => typeof binding?.code === 'string' && typeof binding?.label === 'string')
            .slice(0, 3);
        }
      }
      return bindings;
    } catch {
      return cloneBindings(DEFAULT_BINDINGS);
    }
  }

  private save(): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
  }
}

export const controlSettings = new ControlSettings();

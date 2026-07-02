type OscillatorWave = OscillatorType;

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorWave;
  gain?: number;
  slideTo?: number;
}

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export class SoundSystem {
  private ctx?: AudioContext;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (this.muted) {
      return;
    }

    const ctx = this.getContext();
    void ctx?.resume();
  }

  jump(airJump: boolean): void {
    this.tone({
      freq: airJump ? 620 : 360,
      slideTo: airJump ? 820 : 480,
      duration: 0.11,
      type: 'square',
      gain: 0.11,
    });
  }

  land(strength = 0): void {
    const crash = Math.max(0, Math.min(1, strength));
    this.tone({
      freq: 132 - crash * 52,
      slideTo: 96 - crash * 34,
      duration: 0.05 + crash * 0.14,
      type: crash > 0.45 ? 'sawtooth' : 'sine',
      gain: 0.08 + crash * 0.08,
    });
    if (crash > 0.5) {
      window.setTimeout(() => this.tone({ freq: 58, duration: 0.12, type: 'triangle', gain: 0.08 }), 38);
    }
  }

  collect(): void {
    this.tone({ freq: 880, slideTo: 1180, duration: 0.08, type: 'triangle', gain: 0.12 });
  }

  overdrive(): void {
    this.tone({ freq: 360, slideTo: 980, duration: 0.16, type: 'sawtooth', gain: 0.12 });
    window.setTimeout(() => this.tone({ freq: 720, slideTo: 1440, duration: 0.12, type: 'triangle', gain: 0.09 }), 90);
  }

  milestone(): void {
    this.tone({ freq: 520, slideTo: 980, duration: 0.16, type: 'triangle', gain: 0.13 });
    window.setTimeout(() => this.tone({ freq: 780, slideTo: 1320, duration: 0.14, type: 'square', gain: 0.08 }), 95);
  }

  boost(): void {
    this.tone({ freq: 260, slideTo: 420, duration: 0.09, type: 'sawtooth', gain: 0.07 });
  }

  hit(): void {
    this.tone({ freq: 210, slideTo: 118, duration: 0.13, type: 'square', gain: 0.09 });
    window.setTimeout(() => this.tone({ freq: 72, duration: 0.09, type: 'triangle', gain: 0.06 }), 42);
  }

  launch(charge: number): void {
    this.tone({
      freq: 220 + charge * 180,
      slideTo: 520 + charge * 520,
      duration: 0.12 + charge * 0.12,
      type: 'sawtooth',
      gain: 0.1,
    });
  }

  bounce(): void {
    this.tone({ freq: 420, slideTo: 760, duration: 0.1, type: 'square', gain: 0.1 });
  }

  finish(): void {
    this.tone({ freq: 190, slideTo: 80, duration: 0.28, type: 'triangle', gain: 0.1 });
  }

  upgrade(): void {
    this.tone({ freq: 520, slideTo: 920, duration: 0.12, type: 'triangle', gain: 0.1 });
  }

  private tone(options: ToneOptions): void {
    if (this.muted) {
      return;
    }

    const ctx = this.getContext();
    if (!ctx) {
      return;
    }

    void ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const peak = options.gain ?? 0.1;

    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(options.freq, now);
    if (options.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.slideTo), now + options.duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + options.duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + options.duration + 0.03);
  }

  private getContext(): AudioContext | undefined {
    if (this.ctx) {
      return this.ctx;
    }

    const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) {
      return undefined;
    }

    this.ctx = new AudioContextClass();
    return this.ctx;
  }
}

export const soundSystem = new SoundSystem();

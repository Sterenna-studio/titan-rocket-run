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

  land(): void {
    this.tone({ freq: 130, duration: 0.05, type: 'sine', gain: 0.08 });
  }

  collect(): void {
    this.tone({ freq: 880, slideTo: 1180, duration: 0.08, type: 'triangle', gain: 0.12 });
  }

  boost(): void {
    this.tone({ freq: 260, slideTo: 420, duration: 0.09, type: 'sawtooth', gain: 0.07 });
  }

  mine(): void {
    this.tone({ freq: 170, slideTo: 90, duration: 0.16, type: 'sawtooth', gain: 0.13 });
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

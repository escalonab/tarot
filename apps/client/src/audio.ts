/**
 * Tiny procedural sound bank built on WebAudio so the project has no binary assets yet.
 * Swap any of these for real samples (e.g. via Howler) later without touching call sites.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = localStorage.getItem("tarot.muted") === "1";

function ensure(): { ctx: AudioContext; master: GainNode } | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master! };
}

/** Call from a user gesture once so the browser lets us play audio afterwards. */
export function unlockAudio(): void {
  ensure();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  localStorage.setItem("tarot.muted", value ? "1" : "0");
  if (master) master.gain.value = value ? 0 : 0.35;
}

interface ToneOpts {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  at?: number;
  slideTo?: number;
}

function tone({ freq, duration, type = "sine", gain = 1, at = 0, slideTo }: ToneOpts): void {
  const a = ensure();
  if (!a) return;
  const t0 = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(env).connect(a.master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(duration: number, gain = 0.4, at = 0, highpass = 800): void {
  const a = ensure();
  if (!a) return;
  const t0 = a.ctx.currentTime + at;
  const buffer = a.ctx.createBuffer(1, Math.ceil(a.ctx.sampleRate * duration), a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = a.ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(env).connect(a.master);
  src.start(t0);
}

export const sfx = {
  /** You put a card on the board. */
  place(): void {
    noise(0.06, 0.5, 0, 1500);
    tone({ freq: 520, duration: 0.12, type: "triangle", gain: 0.6 });
  },
  /** Opponent put a card on the board — lower, distinct. */
  opponentPlace(): void {
    noise(0.06, 0.4, 0, 900);
    tone({ freq: 330, duration: 0.16, type: "triangle", gain: 0.6 });
  },
  draw(): void {
    noise(0.12, 0.25, 0, 2500);
  },
  select(): void {
    tone({ freq: 880, duration: 0.05, type: "sine", gain: 0.25 });
  },
  yourTurn(): void {
    tone({ freq: 660, duration: 0.12, gain: 0.5 });
    tone({ freq: 990, duration: 0.18, gain: 0.5, at: 0.11 });
  },
  skipped(): void {
    tone({ freq: 440, duration: 0.2, type: "sawtooth", gain: 0.2, slideTo: 220 });
  },
  error(): void {
    tone({ freq: 200, duration: 0.15, type: "square", gain: 0.2 });
  },
  matchFound(): void {
    [523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.15, gain: 0.5, at: i * 0.08 }));
  },
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, duration: 0.3, gain: 0.5, at: i * 0.12 }));
  },
  lose(): void {
    [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, duration: 0.3, type: "triangle", gain: 0.4, at: i * 0.14 }));
  },
  tie(): void {
    tone({ freq: 440, duration: 0.3, gain: 0.4 });
    tone({ freq: 440, duration: 0.3, gain: 0.4, at: 0.2 });
  },
  achievement(): void {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, duration: 0.2, type: "triangle", gain: 0.4, at: i * 0.07 }));
  },
};

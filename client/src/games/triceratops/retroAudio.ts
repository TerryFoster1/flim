export type TriceratopsSfx =
  | "start"
  | "jump"
  | "land"
  | "charge"
  | "smash"
  | "collect"
  | "damage"
  | "combo"
  | "rampage"
  | "wrap"
  | "cut";

type OscillatorTypeName = OscillatorType;

const STORAGE_KEY = "flim.backlot.audioMuted";

function readMutedPreference() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function writeMutedPreference(muted: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, muted ? "true" : "false");
}

export type RetroAudioEngine = {
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  startMusic: () => Promise<void>;
  stopMusic: () => void;
  playSfx: (name: TriceratopsSfx) => void;
  dispose: () => void;
};

export function createRetroAudioEngine(): RetroAudioEngine {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicTimer: number | null = null;
  let step = 0;
  let muted = readMutedPreference();

  const getContext = () => {
    if (typeof window === "undefined") return null;
    if (!context) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      context = new AudioContextCtor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.24;
      master.connect(context.destination);
    }
    return context;
  };

  const setMasterGain = (value: number, duration = 0.03) => {
    const audio = getContext();
    if (!audio || !master) return;
    master.gain.cancelScheduledValues(audio.currentTime);
    master.gain.linearRampToValueAtTime(value, audio.currentTime + duration);
  };

  const tone = (frequency: number, start: number, duration: number, type: OscillatorTypeName, gain = 0.08) => {
    const audio = getContext();
    if (!audio || !master || muted) return;
    const osc = audio.createOscillator();
    const envelope = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(envelope);
    envelope.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  };

  const noise = (start: number, duration: number, gain = 0.09) => {
    const audio = getContext();
    if (!audio || !master || muted) return;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const envelope = audio.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 1300;
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(start);
  };

  const playMusicStep = () => {
    const audio = getContext();
    if (!audio || muted) return;
    const bass = [82.41, 98, 110, 73.42][step % 4];
    const lead = [329.63, 392, 440, 493.88, 392, 329.63, 293.66, 246.94][step % 8];
    const now = audio.currentTime;
    tone(bass, now, 0.16, "square", 0.035);
    if (step % 2 === 0) tone(lead, now + 0.02, 0.11, "triangle", 0.026);
    if (step % 4 === 3) noise(now + 0.09, 0.035, 0.022);
    step += 1;
  };

  const startMusic = async () => {
    const audio = getContext();
    if (!audio) return;
    if (audio.state === "suspended") await audio.resume();
    if (musicTimer !== null) return;
    playMusicStep();
    musicTimer = window.setInterval(playMusicStep, 185);
  };

  const stopMusic = () => {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  };

  return {
    isMuted: () => muted,
    setMuted: (nextMuted) => {
      muted = nextMuted;
      writeMutedPreference(muted);
      setMasterGain(muted ? 0 : 0.24);
    },
    startMusic,
    stopMusic,
    playSfx: (name) => {
      const audio = getContext();
      if (!audio || muted) return;
      const now = audio.currentTime;
      if (name === "jump") tone(420, now, 0.08, "square", 0.055);
      if (name === "land") noise(now, 0.055, 0.045);
      if (name === "charge") {
        tone(110, now, 0.12, "sawtooth", 0.055);
        tone(220, now + 0.05, 0.11, "square", 0.04);
      }
      if (name === "smash") {
        noise(now, 0.13, 0.11);
        tone(74, now, 0.12, "square", 0.07);
      }
      if (name === "collect") {
        tone(523.25, now, 0.07, "triangle", 0.05);
        tone(783.99, now + 0.055, 0.08, "triangle", 0.045);
      }
      if (name === "damage" || name === "cut") {
        tone(155.56, now, 0.12, "sawtooth", 0.06);
        tone(103.83, now + 0.08, 0.18, "sawtooth", 0.055);
      }
      if (name === "combo") tone(659.25, now, 0.06, "square", 0.04);
      if (name === "rampage") {
        [196, 261.63, 329.63, 392].forEach((note, index) => tone(note, now + index * 0.045, 0.12, "square", 0.052));
      }
      if (name === "wrap") {
        [392, 493.88, 587.33, 783.99].forEach((note, index) => tone(note, now + index * 0.075, 0.18, "triangle", 0.058));
      }
      if (name === "start") {
        [196, 246.94, 329.63].forEach((note, index) => tone(note, now + index * 0.06, 0.13, "square", 0.045));
      }
    },
    dispose: () => {
      stopMusic();
      if (context) {
        context.close().catch(() => undefined);
      }
      context = null;
      master = null;
    },
  };
}

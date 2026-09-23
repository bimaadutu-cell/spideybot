import type { GameSettings } from "./types";

export type SoundName = "stepWood" | "stepTile" | "stepMetal" | "stepSoft" | "monsterStep" |
  "door" | "pickup" | "lock" | "switch" | "creak" | "whisper" | "rasp" | "scare" | "victory" | "button" | "tick";

export class HorrorAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private rain: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private heartbeatClock = 0;
  private mode: "menu" | "game" | "end" = "menu";
  private settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  async init(): Promise<void> {
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return;
    }
    const ctx = new AudioContext();
    this.context = ctx;
    const master = ctx.createGain();
    const ambience = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    const rain = ctx.createGain();
    this.master = master;
    this.ambience = ambience;
    this.music = music;
    this.sfx = sfx;
    this.rain = rain;
    master.connect(ctx.destination);
    ambience.connect(master);
    music.connect(master);
    sfx.connect(master);
    rain.connect(ambience);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < channel.length; i++) {
      previous = (previous + (Math.random() * 2 - 1) * 0.09) * 0.99;
      channel[i] = previous;
    }
    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.78;
    wind.connect(windFilter).connect(windGain).connect(ambience);
    wind.start();

    const rainSource = ctx.createBufferSource();
    rainSource.buffer = buffer;
    rainSource.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 1800;
    rainSource.connect(rainFilter).connect(rain);
    rainSource.start();

    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 46;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 125;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.17;
    drone.connect(droneFilter).connect(droneGain).connect(music);
    drone.start();
    this.drone = drone;
    this.setSettings(this.settings);
    this.setMode("menu");
    if (ctx.state === "suspended") await ctx.resume();
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
    if (!this.context || !this.master || !this.sfx || !this.ambience || !this.music) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.master / 100, now, 0.06);
    this.sfx.gain.setTargetAtTime(settings.sfx / 100, now, 0.06);
    this.ambience.gain.setTargetAtTime(settings.ambience / 100 * 0.8, now, 0.08);
    this.music.gain.setTargetAtTime(settings.music / 100 * (this.mode === "menu" ? 0.74 : 0.43), now, 0.2);
  }

  setMode(mode: "menu" | "game" | "end"): void {
    this.mode = mode;
    if (!this.context || !this.music || !this.rain) return;
    const now = this.context.currentTime;
    this.music.gain.setTargetAtTime(this.settings.music / 100 * (mode === "menu" ? 0.74 : mode === "end" ? 0.18 : 0.43), now, 0.5);
    this.rain.gain.setTargetAtTime(mode === "menu" ? 0.45 : 0.05, now, 0.5);
  }

  private tone(frequency: number, endFrequency: number, duration: number, volume: number,
    wave: OscillatorType = "sine", delay = 0): void {
    const ctx = this.context;
    if (!ctx || !this.sfx) return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(12, endFrequency), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(this.sfx);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private hiss(duration: number, volume: number, frequency: number): void {
    const ctx = this.context;
    if (!ctx || !this.sfx) return;
    const count = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, count, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / count, 0.5);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.sfx);
    source.start();
  }

  play(sound: SoundName): void {
    if (!this.context) return;
    switch (sound) {
      case "stepWood": this.tone(145, 72, 0.12, 0.19, "triangle"); this.hiss(0.075, 0.08, 480); break;
      case "stepTile": this.tone(370, 160, 0.095, 0.14, "triangle"); break;
      case "stepMetal": this.tone(590, 210, 0.3, 0.19, "triangle"); break;
      case "stepSoft": this.hiss(0.1, 0.05, 210); break;
      case "monsterStep": this.tone(78, 33, 0.29, 0.29, "sawtooth"); this.hiss(0.19, 0.06, 220); break;
      case "door": this.tone(170, 46, 0.86, 0.15, "sawtooth"); this.hiss(0.42, 0.09, 780); break;
      case "pickup": this.tone(470, 830, 0.22, 0.12, "sine"); this.tone(690, 1110, 0.28, 0.09, "sine", 0.08); break;
      case "lock": this.tone(430, 135, 0.16, 0.2, "square"); break;
      case "switch": this.tone(230, 85, 0.35, 0.18, "sawtooth"); this.hiss(0.45, 0.09, 2700); break;
      case "creak": this.tone(114, 38, 1.1, 0.08, "sawtooth"); break;
      case "whisper": this.hiss(0.8, 0.12, 670); this.tone(105, 74, 0.63, 0.07, "sine"); break;
      case "rasp": this.hiss(0.7, 0.17, 280); this.tone(94, 38, 0.82, 0.12, "sawtooth"); break;
      case "scare":
        this.tone(240, 38, 1.8, 0.4, "sawtooth");
        this.tone(88, 31, 2, 0.48, "square");
        this.hiss(1.2, 0.31, 1800);
        break;
      case "victory":
        this.tone(220, 220, 1.8, 0.12);
        this.tone(330, 330, 1.8, 0.1, "sine", 0.16);
        this.tone(440, 440, 2.4, 0.09, "sine", 0.36);
        break;
      case "button": this.tone(340, 210, 0.09, 0.1, "sine"); break;
      case "tick": this.tone(970, 640, 0.037, 0.038, "triangle"); break;
    }
  }

  update(distance: number, chasing: boolean, outside: boolean, delta: number): void {
    if (!this.context || !this.rain || !this.drone) return;
    const now = this.context.currentTime;
    const closeness = Math.max(0, 1 - distance / 12);
    this.drone.frequency.setTargetAtTime(chasing ? 63 : 46 + closeness * 5, now, 0.2);
    this.rain.gain.setTargetAtTime(outside ? 0.52 : 0.035, now, 0.6);
    if (this.mode !== "game") return;
    this.heartbeatClock -= delta;
    if (closeness > 0.12 && this.heartbeatClock <= 0) {
      const interval = chasing ? 0.49 : 1.25 - closeness * 0.54;
      this.heartbeatClock = interval;
      this.tone(65, 34, 0.22, (0.14 + closeness * 0.3), "sine");
      this.tone(57, 33, 0.19, (0.1 + closeness * 0.21), "sine", 0.18);
    }
  }

  dispose(): void {
    if (this.context) void this.context.close();
    this.context = null;
  }
}
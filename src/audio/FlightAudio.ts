/**
 * Sintetizador procedural (Web Audio API): motor contínuo e alertas sonoros.
 * Nenhum arquivo de áudio: tudo é gerado com osciladores e ruído.
 */
import type { FlightEvent } from '../store/flightEvents';
import { IDLE_ENGINE_GAIN, type EngineSound } from './engineSound';

/** Volume geral: o motor é ambiente, não protagonista. */
const MASTER_GAIN = 0.22;
/** Constante de tempo das transições do motor (s). */
const ENGINE_SMOOTHING_S = 0.25;
/** Corte do motor durante a rotação de 180° do flip (s). */
const FLIP_CUT_S = 0.7;
/** Sopro dos jatos de controle de reação (RCS) que começam e param a rotação do flip (s). */
const RCS_PUFF_S = 0.18;
const RCS_PUFF_HZ = 800;

interface EngineNodes {
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
  readonly hum: OscillatorNode;
  readonly sub: OscillatorNode;
}

/** Ruído marrom em loop, com os extremos igualados para o laço não estalar. */
function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const drift = (data[length - 1]! - data[0]!) / (length - 1);
  for (let i = 0; i < length; i++) data[i]! -= drift * i;
  return buffer;
}

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function nearlyEqual(a: EngineSound, b: EngineSound): boolean {
  return (
    Math.abs(a.humHz - b.humHz) < 0.2 &&
    Math.abs(a.cutoffHz - b.cutoffHz) < 5 &&
    Math.abs(a.gain - b.gain) < 0.005
  );
}

export class FlightAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: EngineNodes | null = null;
  private enabled = true;
  private lastSound: EngineSound | null = null;
  private flipCutUntil = 0;
  private whiteNoise: AudioBuffer | null = null;

  /** Liga ou silencia tudo. Ao ligar, chame `unlock()` dentro do mesmo gesto. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(enabled ? MASTER_GAIN : 0, this.ctx.currentTime, 0.05);
    }
  }

  /** Cria ou retoma o AudioContext; os navegadores exigem um gesto do usuário. */
  unlock(): void {
    if (!this.enabled || typeof AudioContext === 'undefined') return;
    if (!this.ctx) this.build();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** Pausa o processamento (aba oculta ou cockpit fora da tela). */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  /** Retoma um contexto já liberado por um gesto anterior (sem criar um novo). */
  resume(): void {
    if (this.enabled && this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  updateEngine(sound: EngineSound): void {
    const { ctx, engine } = this;
    if (!ctx || !engine) return;
    const t = ctx.currentTime;
    const target = t < this.flipCutUntil ? { ...sound, gain: IDLE_ENGINE_GAIN } : sound;
    if (this.lastSound && nearlyEqual(this.lastSound, target)) return;
    this.lastSound = target;
    engine.hum.frequency.setTargetAtTime(target.humHz, t, ENGINE_SMOOTHING_S);
    engine.sub.frequency.setTargetAtTime(target.humHz / 2, t, ENGINE_SMOOTHING_S);
    engine.filter.frequency.setTargetAtTime(target.cutoffHz, t, ENGINE_SMOOTHING_S);
    engine.gain.gain.setTargetAtTime(target.gain, t, ENGINE_SMOOTHING_S);
  }

  /** Alertas: bipe de contagem regressiva e um som próprio para cada marco. */
  play(event: FlightEvent): void {
    const ctx = this.ctx;
    // Um contexto ainda retomando (primeiro clique) toca o que foi agendado assim que voltar.
    if (!ctx || !this.enabled || ctx.state === 'closed') return;
    const t = ctx.currentTime + 0.01;

    if (event.type === 'countdown') {
      this.tone(t, 880, 0.12, 'sine', 0.35);
      return;
    }
    if (event.type === 'crew-rest') {
      // Aviso suave de cabine: Ré → Lá descendo no começo do descanso (gravidade zero), subindo na volta à queima.
      const [first, second] = event.resting ? [587.33, 440] : [440, 587.33];
      this.tone(t, first, 0.35, 'sine', 0.16);
      this.tone(t + 0.22, second, 0.5, 'sine', 0.16);
      return;
    }
    switch (event.kind) {
      case 'ignition':
        // "Vai": bipe longo e agudo sobre um baque grave descendente.
        this.tone(t, 1320, 0.45, 'sine', 0.35);
        this.tone(t, 150, 0.9, 'sine', 0.6, 38);
        break;
      case 'cmb-entry':
        // A CMB entra no visível: dois toques ascendentes, como um brilho.
        this.tone(t, 660, 0.35, 'triangle', 0.3);
        this.tone(t + 0.14, 990, 0.5, 'triangle', 0.3);
        break;
      case 'flip':
        // Alarme de dois tons e corte breve do motor enquanto a nave gira; os jatos de controle de
        // reação sopram no começo e no fim da rotação de 180°.
        this.flipCutUntil = ctx.currentTime + FLIP_CUT_S;
        [988, 740, 988, 740].forEach((f, i) => this.tone(t + i * 0.16, f, 0.13, 'square', 0.1));
        this.puff(t, RCS_PUFF_S, RCS_PUFF_HZ);
        this.puff(t + FLIP_CUT_S - RCS_PUFF_S, RCS_PUFF_S, RCS_PUFF_HZ);
        break;
      case 'arrival':
        // Arpejo maior: Dó, Mi, Sol, Dó.
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(t + i * 0.16, f, 0.8, 'triangle', 0.3));
        break;
    }
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.value = 160;
    filter.connect(gain);

    // Ronco: ruído marrom filtrado.
    const noise = ctx.createBufferSource();
    noise.buffer = brownNoise(ctx, 4);
    noise.loop = true;
    noise.connect(filter);

    // Zumbido: dente de serra filtrado e um sub-harmônico senoidal.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 40;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.08;
    hum.connect(humGain).connect(filter);
    const sub = ctx.createOscillator();
    sub.frequency.value = 20;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subGain).connect(gain);

    noise.start();
    hum.start();
    sub.start();
    this.ctx = ctx;
    this.master = master;
    this.engine = { gain, filter, hum, sub };
  }

  /** Sopro de gás: ruído branco num passa-banda, com ataque curto e decaimento exponencial. */
  private puff(at: number, duration: number, hz: number): void {
    const ctx = this.ctx!;
    this.whiteNoise ??= whiteNoise(ctx, 1);
    const source = ctx.createBufferSource();
    source.buffer = this.whiteNoise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = hz;
    band.Q.value = 1.4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.5, at + 0.015);
    env.gain.exponentialRampToValueAtTime(1e-4, at + duration);
    source.connect(band).connect(env).connect(this.master!);
    source.onended = () => env.disconnect();
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  /** Nota com ataque curto e decaimento exponencial; `endHz` faz uma varredura. */
  private tone(at: number, hz: number, duration: number, type: OscillatorType, peak: number, endHz?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, at);
    if (endHz !== undefined) osc.frequency.exponentialRampToValueAtTime(endHz, at + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.01);
    env.gain.exponentialRampToValueAtTime(1e-4, at + duration);
    osc.connect(env).connect(this.master!);
    osc.onended = () => env.disconnect();
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}

export const flightAudio = new FlightAudio();

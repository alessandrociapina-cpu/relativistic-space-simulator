import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCEL_G } from '../physics/destinations';
import { MAX_MANUAL_ETA, useFlightStore } from './useFlightStore';

const initialState = useFlightStore.getState();
const store = () => useFlightStore.getState();

beforeEach(() => useFlightStore.setState(initialState, true));

/** Roda o loop em passos de `dt` segundos reais até `until` (ou o limite de passos). */
function run(dt: number, steps: number, until: () => boolean = () => false) {
  for (let i = 0; i < steps && !until(); i++) store().tick(dt);
}

describe('estado inicial', () => {
  it('Autopilot parado na partida para Proxima a 1,61×10⁶ G, 1x, Auto-Step Down ligado', () => {
    expect(store()).toMatchObject({
      mode: 'autopilot',
      accelG: DEFAULT_ACCEL_G,
      tau: 0,
      playing: false,
      timeScale: 1,
      autoStepDown: true,
    });
    expect(store().destination.id).toBe('proxima');
    expect(store().flight.gamma).toBe(1);
  });
});

describe('loop de tempo próprio', () => {
  it('não avança parado', () => {
    store().tick(1);
    expect(store().tau).toBe(0);
  });

  it('avança dt × M_τ e atualiza o snapshot', () => {
    store().setTimeScale(5);
    store().togglePlay();
    store().tick(0.5);
    expect(store().tau).toBe(2.5);
    expect(store().flight.tau).toBe(2.5);
    expect(store().flight.gamma).toBeGreaterThan(1);
  });

  it('para na chegada e Repetir recomeça do zero', () => {
    store().setAutoStepDown(false);
    store().setTimeScale(100);
    store().togglePlay();
    run(0.1, 1000);
    expect(store().tau).toBe(store().profile.tauTotal);
    expect(store().playing).toBe(false);
    expect(store().flight.phase).toBe('arrived');
    store().togglePlay();
    expect(store()).toMatchObject({ tau: 0, playing: true });
  });
});

describe('Auto-Step Down (§7.2)', () => {
  it('reduz para 1x exatamente na entrada da janela da CMB', () => {
    const [cmb] = store().criticalWindows;
    store().setTimeScale(20);
    store().togglePlay();
    run(0.1, 1000, () => store().timeScale === 1);
    expect(store().timeScale).toBe(1);
    expect(store().tau).toBe(cmb!.startTau);
    expect(store().flight.gamma).toBeCloseTo(400, 6);
  });

  it('detecta a entrada mesmo quando um único frame pula a janela inteira', () => {
    const [, preFlip] = store().criticalWindows;
    store().seek(preFlip!.startTau - 1);
    store().setTimeScale(100);
    store().togglePlay();
    store().tick(0.1); // 10 s de tempo próprio > janela de 10 s
    expect(store()).toMatchObject({ tau: preFlip!.startTau, timeScale: 1 });
  });

  it('dentro de uma janela, o usuário pode voltar a acelerar', () => {
    const [cmb] = store().criticalWindows;
    store().seek(cmb!.startTau + 1);
    store().setTimeScale(20);
    store().togglePlay();
    store().tick(0.1);
    expect(store().timeScale).toBe(20);
  });

  it('desligado, não altera o multiplicador', () => {
    store().setAutoStepDown(false);
    store().setTimeScale(100);
    store().togglePlay();
    run(0.1, 100);
    expect(store().timeScale).toBe(100);
  });

  it('não acelera multiplicadores abaixo de 1x', () => {
    const [cmb] = store().criticalWindows;
    store().seek(cmb!.startTau - 0.01);
    store().setTimeScale(0.1);
    store().togglePlay();
    store().tick(1);
    expect(store().timeScale).toBe(0.1);
  });
});

describe('modos e missão', () => {
  it('Cruzeiro Livre parte da rapidez atual, pausa e congela a posição', () => {
    store().seek(100);
    store().togglePlay();
    const { eta, positionM } = store().flight;
    store().setMode('manual');
    expect(store()).toMatchObject({ mode: 'manual', playing: false, manualEta: eta });
    expect(store().flight).toMatchObject({ phase: 'cruise', eta, positionM });

    store().setManualEta(12);
    expect(store().flight).toMatchObject({ eta: 12, positionM, gamma: Math.cosh(12) });
    store().tick(1);
    expect(store().tau).toBe(100);
  });

  it('a rapidez manual fica limitada a log₁₀γ ≤ 7,5', () => {
    store().setMode('manual');
    store().setManualEta(50);
    expect(store().manualEta).toBe(MAX_MANUAL_ETA);
    store().setManualEta(-1);
    expect(store().manualEta).toBe(0);
  });

  it('voltar ao Autopilot restaura a cinemática do instante τ', () => {
    store().seek(100);
    const autopilot = store().flight;
    store().setMode('manual');
    store().setManualEta(3);
    store().setMode('autopilot');
    expect(store().flight).toEqual(autopilot);
  });

  it('trocar destino ou aceleração reinicia a missão', () => {
    store().seek(200);
    store().togglePlay();
    store().setDestination('sirius');
    expect(store()).toMatchObject({ tau: 0, playing: false, accelG: DEFAULT_ACCEL_G });
    expect(store().destination.id).toBe('sirius');
    expect(store().profile.tauTotal / 60).toBeCloseTo(10.43, 2);

    store().setAccelG(1);
    expect(store().profile.tauTotal).toBeGreaterThan(1e8);
    expect(store().criticalWindows.map((w) => w.kind)).toEqual(['pre-flip']);
  });

  it('seek limita τ a [0, τ_total]', () => {
    store().seek(-5);
    expect(store().tau).toBe(0);
    store().seek(1e9);
    expect(store().tau).toBe(store().profile.tauTotal);
  });
});

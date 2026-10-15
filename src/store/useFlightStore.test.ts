import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCEL_G } from '../physics/destinations';
import { COUNTDOWN_FROM_S, onFlightEvent, type FlightEvent } from './flightEvents';
import { MAX_MANUAL_ETA, useFlightStore } from './useFlightStore';

const initialState = useFlightStore.getState();
const store = () => useFlightStore.getState();

beforeEach(() => useFlightStore.setState(initialState, true));

/** Roda o loop em passos de `dt` segundos reais até `until` (ou o limite de passos). */
function run(dt: number, steps: number, until: () => boolean = () => false) {
  for (let i = 0; i < steps && !until(); i++) store().tick(dt);
}

/** Partida a partir de τ = 0, pulando a contagem regressiva. */
function launch() {
  store().togglePlay();
  store().tick(COUNTDOWN_FROM_S);
  expect(store().playing).toBe(true);
}

/** Captura os eventos emitidos durante `fn`. */
function captureEvents(fn: () => void): FlightEvent[] {
  const events: FlightEvent[] = [];
  const off = onFlightEvent((e) => events.push(e));
  try {
    fn();
  } finally {
    off();
  }
  return events;
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
    launch();
    store().tick(0.5);
    expect(store().tau).toBe(2.5);
    expect(store().flight.tau).toBe(2.5);
    expect(store().flight.gamma).toBeGreaterThan(1);
  });

  it('para na chegada e Repetir recomeça do zero com nova contagem', () => {
    store().setAutoStepDown(false);
    store().setTimeScale(100);
    launch();
    run(0.1, 1000);
    expect(store().tau).toBe(store().profile.tauTotal);
    expect(store().playing).toBe(false);
    expect(store().flight.phase).toBe('arrived');
    store().togglePlay();
    expect(store()).toMatchObject({ tau: 0, playing: false, ignitionCountdownS: COUNTDOWN_FROM_S });
  });

  it('pausar e retomar no meio do voo não repete a contagem', () => {
    launch();
    store().tick(1);
    store().togglePlay();
    expect(store().playing).toBe(false);
    store().togglePlay();
    expect(store()).toMatchObject({ playing: true, ignitionCountdownS: null, tau: 1 });
  });
});

describe('contagem regressiva e marcos (alertas sonoros)', () => {
  it('ignição: 3, 2, 1 em segundos reais (mesmo a 100x) e então a partida', () => {
    store().setTimeScale(100);
    const events = captureEvents(() => {
      store().togglePlay();
      run(0.1, 29);
      expect(store()).toMatchObject({ tau: 0, playing: false });
      store().tick(0.1);
    });
    expect(store()).toMatchObject({ playing: true, ignitionCountdownS: null, tau: 0 });
    expect(events).toEqual([
      { type: 'countdown', target: 'ignition', secondsLeft: 3 },
      { type: 'countdown', target: 'ignition', secondsLeft: 2 },
      { type: 'countdown', target: 'ignition', secondsLeft: 1 },
      { type: 'milestone', kind: 'ignition' },
    ]);
  });

  it('o botão durante a contagem aborta a partida', () => {
    store().togglePlay();
    store().tick(1);
    store().togglePlay();
    expect(store()).toMatchObject({ ignitionCountdownS: null, playing: false, tau: 0 });
    store().tick(5);
    expect(store().playing).toBe(false);
  });

  it('flip a 1x: bipes 3, 2, 1 e o marco no instante τ½', () => {
    store().setAutoStepDown(false);
    store().seek(store().profile.tauHalf - 3.5);
    store().togglePlay();
    const events = captureEvents(() => run(0.1, 40));
    expect(events.filter((e) => e.type === 'countdown' || e.kind === 'flip')).toEqual([
      { type: 'countdown', target: 'flip', secondsLeft: 3 },
      { type: 'countdown', target: 'flip', secondsLeft: 2 },
      { type: 'countdown', target: 'flip', secondsLeft: 1 },
      { type: 'milestone', kind: 'flip' },
    ]);
  });

  it('missão completa: ignição, CMB, flip, CMB e chegada, nessa ordem', () => {
    store().setAutoStepDown(false);
    store().setTimeScale(20);
    const events = captureEvents(() => {
      store().togglePlay();
      run(0.1, 1000, () => store().flight.phase === 'arrived');
    });
    expect(events.filter((e) => e.type === 'milestone').map((e) => e.kind)).toEqual([
      'ignition',
      'cmb-entry',
      'flip',
      'cmb-entry',
      'arrival',
    ]);
    // cada bipe aponta para o próximo marco
    let expectedTarget: string | null = null;
    for (const e of [...events].reverse()) {
      if (e.type === 'milestone') expectedTarget = e.kind;
      else expect(e.target).toBe(expectedTarget);
    }
  });

  it('scrub não dispara marcos nem bipes', () => {
    const events = captureEvents(() => {
      store().seek(store().profile.tauHalf + 1);
      store().seek(store().profile.tauTotal);
    });
    expect(events).toEqual([]);
  });
});

describe('explicações (modo Explicar)', () => {
  it('anuncia cada efeito quando ele começa em voo', () => {
    launch();
    store().tick(0.1);
    expect(store().insight).toBe('kinematics');
    run(0.1, 200, () => store().insight === 'aberration');
    expect(store().flight.beta).toBeCloseTo(0.5, 2);
    expect(store().announcedEffects).toEqual(['kinematics', 'aberration']);
  });

  it('uma vez por missão: a CMB que volta ao visível na frenagem não é anunciada de novo', () => {
    store().setAutoStepDown(false);
    store().setTimeScale(20);
    launch();
    const seen: string[] = [];
    run(0.1, 1000, () => {
      const { insight } = store();
      if (insight !== null && seen.at(-1) !== insight) seen.push(insight);
      return store().flight.phase === 'arrived';
    });
    expect(seen.filter((id) => id === 'cmb-visible')).toHaveLength(1);
    expect(store().insight).toBe('arrival');
    expect(new Set(store().announcedEffects).size).toBe(store().announcedEffects.length);
  });

  it('o scrub não anuncia e dispensa o cartão', () => {
    launch();
    store().tick(0.1);
    store().seek(200);
    expect(store().insight).toBeNull();
    expect(store().announcedEffects).toEqual(['kinematics']);
  });

  it('nova partida e nova missão zeram os anúncios', () => {
    launch();
    run(0.1, 120);
    expect(store().announcedEffects.length).toBeGreaterThan(1);
    store().togglePlay(); // pausa
    store().seek(store().profile.tauTotal);
    store().togglePlay(); // Repetir
    expect(store()).toMatchObject({ insight: null, announcedEffects: [] });
    store().tick(COUNTDOWN_FROM_S);
    store().tick(0.1);
    expect(store().announcedEffects).toEqual(['kinematics']);
    store().setDestination('sirius');
    expect(store()).toMatchObject({ insight: null, announcedEffects: [] });
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

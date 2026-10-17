import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCEL_G } from '../physics/destinations';
import { COUNTDOWN_FROM_S, onFlightEvent, type FlightEvent } from './flightEvents';
import { useFlightStore } from './useFlightStore';

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
  it('parado na partida para Proxima a 1,61×10⁶ g com piloto (hipotético), 1x, Auto-Step Down ligado', () => {
    expect(store()).toMatchObject({
      crew: 'crewed',
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
    expect(events.filter((e) => e.type === 'countdown' || (e.type === 'milestone' && e.kind === 'flip'))).toEqual([
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
      else if (e.type === 'countdown') expect(e.target).toBe(expectedTarget);
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
  it('o planejamento configura a missão inteira de uma vez, parada em τ = 0', () => {
    store().seek(200);
    store().configureMission({ ...store(), destination: store().destination, accelG: 30_000, crew: 'robotic' });
    expect(store()).toMatchObject({ tau: 0, playing: false, accelG: 30_000, crew: 'robotic' });
    store().setCrew('crewed');
    expect(store().crew).toBe('crewed');
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

  it('toda missão nova começa em tempo real (1 s/s); mexer no multiplicador apaga o aviso', () => {
    expect(store().timeScaleTouched).toBe(false);
    store().setTimeScale(20);
    expect(store().timeScaleTouched).toBe(true);
    store().setAccelG(1);
    expect(store().timeScale).toBe(1);
    store().setDestination('andromeda');
    expect(store().timeScale).toBe(1);
  });

  it('o botão do motor desliga (rampa até 0 e inércia) e religa (piloto automático até o alvo)', () => {
    store().setAccelG(1);
    const plan = store().profile;
    store().seek(0.2 * plan.tauTotal);
    store().toggleEngine();
    expect(store().profile.maneuvers).toBeDefined();
    expect(store().flight.engine).toBe('ramp');
    store().seek(0.25 * plan.tauTotal);
    expect(store().flight.engine).toBe('off');
    expect(store().flight.thrustAccel).toBe(0);
    store().toggleEngine();
    expect(store().profile.maneuvers!.end).toBe('arrival');
    expect(store().flight.engine).toBe('thrust');
    // Uma nova partida volta ao plano.
    store().seek(store().profile.tauTotal);
    store().togglePlay();
    expect(store().profile).toBe(plan);
    expect(store().plannedProfile).toBe(plan);
  });

  it('a 1 g, o Auto-Step Down desacelera para que a janela da CMB dure ≥ 20 s reais', () => {
    store().setDestination('andromeda');
    store().setAccelG(1);
    const [cmb] = store().criticalWindows;
    store().setTimeScale(31_557_600); // 1 ano/s
    store().seek(cmb!.startTau - 1);
    store().togglePlay();
    store().tick(0.1);
    expect(store().tau).toBe(cmb!.startTau);
    expect((cmb!.endTau - cmb!.startTau) / store().timeScale).toBeGreaterThanOrEqual(20);
    expect(store().timeScale).toBeGreaterThan(1);
  });

  it('acelerar, cruzar e frear: inércia no meio, e o cruzeiro sobrevive à troca de destino', () => {
    store().setAccelG(1);
    store().setCoastEta(Math.atanh(0.9));
    expect(store().profile.coastEta).toBeCloseTo(Math.atanh(0.9), 12);
    store().seek(store().profile.tauHalf);
    expect(store().flight.phase).toBe('coasting');
    store().setDestination('sirius');
    expect(store()).toMatchObject({ tau: 0, coastEta: Math.atanh(0.9) });
    expect(store().profile.brakeStartTau).toBeGreaterThan(store().profile.burnEndTau);
    store().setCoastEta(null);
    expect(store().profile.coastEta).toBeNull();
  });

  it('seek limita τ a [0, τ_total]', () => {
    store().seek(-5);
    expect(store().tau).toBe(0);
    store().seek(1e9);
    expect(store().tau).toBe(store().profile.tauTotal);
  });
});

describe('descansos da tripulação no loop', () => {
  it('a 10 g, o aviso de cabine toca no começo e no fim do primeiro descanso (a 1 dia/s)', () => {
    const DAY = 86_400;
    store().configureMission({ destination: store().destination, accelG: 10, coastEta: null, crew: 'crewed', restRatio: 3 });
    const rest = store().profile.crewRest!;
    expect(store().crewStatus?.condition).toBe('ready');
    store().setAutoStepDown(false);
    store().seek(rest.burnTau - 0.5 * DAY);
    store().togglePlay();
    store().setTimeScale(DAY);
    const events = captureEvents(() => run(0.1, 100)); // 10 dias de bordo: passa do fim do descanso de 8,1 dias
    expect(events.filter((e) => e.type === 'crew-rest')).toEqual([
      { type: 'crew-rest', resting: true },
      { type: 'crew-rest', resting: false },
    ]);
    expect(store().crewStatus?.condition).toBe('thrust');
  });
});

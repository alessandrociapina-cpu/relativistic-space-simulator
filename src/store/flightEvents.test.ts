import { describe, expect, it } from 'vitest';
import { computeCriticalWindows } from '../physics/criticalEvents';
import { DESTINATIONS, destinationMissionProfile } from '../physics/destinations';
import { computeMilestones, detectCrewRestEvent, detectFlightEvents, type Milestone } from './flightEvents';

describe('marcos do voo', () => {
  it('Proxima: CMB na aceleração, flip, CMB na frenagem e chegada', () => {
    const profile = destinationMissionProfile(DESTINATIONS.proxima);
    const milestones = computeMilestones(profile, computeCriticalWindows(profile));
    expect(milestones.map((m) => m.kind)).toEqual(['cmb-entry', 'flip', 'cmb-entry', 'arrival']);
    expect(milestones[1]!.tau).toBe(profile.tauHalf);
    expect(milestones[3]!.tau).toBe(profile.tauTotal);
  });
});

describe('detectFlightEvents', () => {
  const milestones: Milestone[] = [
    { kind: 'flip', tau: 100 },
    { kind: 'arrival', tau: 200 },
  ];

  it('marco cruzado em (τ₀, τ₁]', () => {
    expect(detectFlightEvents(milestones, 99.9, 100, 1)).toContainEqual({ type: 'milestone', kind: 'flip' });
    expect(detectFlightEvents(milestones, 100, 100.1, 1)).not.toContainEqual({ type: 'milestone', kind: 'flip' });
  });

  it('bipe quando o tempo real restante cruza um segundo inteiro', () => {
    expect(detectFlightEvents(milestones, 96.95, 97.05, 1)).toEqual([
      { type: 'countdown', target: 'flip', secondsLeft: 3 },
    ]);
    expect(detectFlightEvents(milestones, 96.8, 96.9, 1)).toEqual([]);
  });

  it('a 100x, o bipe de 3 s soa 300 s de tempo próprio antes do marco', () => {
    const arrival: Milestone[] = [{ kind: 'arrival', tau: 1000 }];
    expect(detectFlightEvents(arrival, 695, 705, 100)).toEqual([
      { type: 'countdown', target: 'arrival', secondsLeft: 3 },
    ]);
    // 30–40 s de tempo próprio antes = 0,3–0,4 s reais: nenhum segundo inteiro cruzado
    expect(detectFlightEvents(arrival, 960, 970, 100)).toEqual([]);
  });

  it('se um passo cruzar vários segundos, vale o mais próximo do marco', () => {
    expect(detectFlightEvents(milestones, 96.5, 98.5, 1)).toEqual([
      { type: 'countdown', target: 'flip', secondsLeft: 2 },
    ]);
  });

  it('depois de cruzar um marco, a contagem segue para o próximo', () => {
    expect(detectFlightEvents(milestones, 99, 197.5, 1)).toEqual([
      { type: 'milestone', kind: 'flip' },
      { type: 'countdown', target: 'arrival', secondsLeft: 3 },
    ]);
  });
});

describe('aviso de descanso da tripulação', () => {
  it('toca na transição, nos dois sentidos, se o ciclo dura ao menos 4 s reais', () => {
    const cycle = 10.8 * 86_400; // 10 g: 2,7 dias de queima + 8,1 de descanso
    expect(detectCrewRestEvent(false, true, cycle, 86_400)).toEqual({ type: 'crew-rest', resting: true });
    expect(detectCrewRestEvent(true, false, cycle, 86_400)).toEqual({ type: 'crew-rest', resting: false });
    expect(detectCrewRestEvent(true, true, cycle, 86_400)).toBeNull();
    // A 1 mês/s o ciclo passa em ~0,4 s: o aviso tocaria sem parar.
    expect(detectCrewRestEvent(false, true, cycle, 30 * 86_400)).toBeNull();
  });
});

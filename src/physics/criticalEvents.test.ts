import { describe, expect, it } from 'vitest';
import { C, G0, LIGHT_YEAR_M, computeFlightState, computeMissionProfile } from './RelativityEngine';
import { DESTINATIONS, destinationMissionProfile } from './destinations';
import {
  CMB_VISIBLE_GAMMA,
  PRE_FLIP_WINDOW_S,
  activeWindowsAt,
  computeCriticalWindows,
  firstWindowStartingIn,
} from './criticalEvents';

const profile = destinationMissionProfile(DESTINATIONS.proxima);
const windows = computeCriticalWindows(profile);

describe('janelas críticas (§7.2) para Proxima', () => {
  it('CMB no visível na aceleração e na frenagem, e os 10 s antes do flip', () => {
    expect(windows.map((w) => w.kind)).toEqual(['cmb-visible', 'pre-flip', 'cmb-visible']);
    const [accel, preFlip, decel] = windows;
    expect(preFlip).toEqual({
      kind: 'pre-flip',
      startTau: profile.tauHalf - PRE_FLIP_WINDOW_S,
      endTau: profile.tauHalf,
    });
    // simetria em torno do flip
    expect(decel!.startTau).toBeCloseTo(profile.tauTotal - accel!.endTau, 9);
    expect(decel!.endTau).toBeCloseTo(profile.tauTotal - accel!.startTau, 9);
  });

  it('os limites das janelas da CMB caem exatamente em γ = 400 e γ = 15000', () => {
    const [accel, , decel] = windows;
    for (const [tau, gamma] of [
      [accel!.startTau, CMB_VISIBLE_GAMMA.min],
      [accel!.endTau, CMB_VISIBLE_GAMMA.max],
      [decel!.startTau, CMB_VISIBLE_GAMMA.max],
      [decel!.endTau, CMB_VISIBLE_GAMMA.min],
    ] as const) {
      expect(computeFlightState(profile, tau).gamma).toBeCloseTo(gamma, 6);
    }
  });

  it('firstWindowStartingIn considera o intervalo (de, até]', () => {
    const [accel] = windows;
    expect(firstWindowStartingIn(windows, 0, accel!.startTau)).toBe(accel);
    expect(firstWindowStartingIn(windows, accel!.startTau, accel!.startTau + 1)).toBeNull();
    expect(firstWindowStartingIn(windows, 0, profile.tauTotal)).toBe(accel);
  });

  it('activeWindowsAt devolve as janelas que contêm τ', () => {
    expect(activeWindowsAt(windows, 0)).toEqual([]);
    expect(activeWindowsAt(windows, profile.tauHalf - 1).map((w) => w.kind)).toEqual(['pre-flip']);
  });
});

describe('janelas críticas em outros regimes', () => {
  it('sem janela da CMB se γ_max < 400', () => {
    const slow = computeMissionProfile(4.25 * LIGHT_YEAR_M, G0);
    expect(computeCriticalWindows(slow).map((w) => w.kind)).toEqual(['pre-flip']);
  });

  it('se γ_max < 15000, a janela da aceleração termina no flip', () => {
    // γ_max ≈ 1000: α·(D/2)/c² ≈ 999
    const alpha = 1e7;
    const profile = computeMissionProfile((2 * 999 * C * C) / alpha, alpha);
    const cmb = computeCriticalWindows(profile).filter((w) => w.kind === 'cmb-visible');
    expect(cmb[0]!.endTau).toBe(profile.tauHalf);
    expect(cmb[1]!.startTau).toBeCloseTo(profile.tauHalf, 9);
  });

  it('missão mais curta que 10 s: a janela do flip começa em τ = 0', () => {
    const profile = computeMissionProfile(100, 10); // τ½ ≈ 3,2 s
    expect(computeCriticalWindows(profile)[0]).toMatchObject({ kind: 'pre-flip', startTau: 0 });
  });
});

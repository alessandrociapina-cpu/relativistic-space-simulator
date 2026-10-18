import { describe, expect, it } from 'vitest';
import { ERID_G, SCIFI_MISSIONS, findSciFiMission } from '../physics/accelerationPresets';
import { DEFAULT_REST_RATIO } from '../physics/crewRest';
import { DESTINATIONS } from '../physics/destinations';
import { ORIGINS, missionDestination } from '../physics/origins';
import type { MissionChoice } from '../store/useFlightStore';
import { SCIFI_TAB_HASH } from './appMode';
import { missionHash, parseMissionLink, sciFiChoice, sciFiHash } from './missionLink';

const demo: MissionChoice = {
  origin: ORIGINS.sol,
  destination: DESTINATIONS.proxima,
  accelG: DESTINATIONS.proxima.defaultAccelG,
  coastEta: null,
  crew: 'crewed',
  restRatio: DEFAULT_REST_RATIO,
};

describe('a missão no endereço', () => {
  it('a demonstração vai e volta igual, sem os valores padrão no link', () => {
    const hash = missionHash(demo);
    expect(hash).toBe(`#viagem?d=proxima&g=${DESTINATIONS.proxima.defaultAccelG}&c=crewed`);
    expect(parseMissionLink(hash)).toEqual({ choice: demo, tab: 'plan' });
  });

  it('de Erid a Tau Ceti, com cruzeiro e descanso de 5×: todos os dígitos de volta', () => {
    const choice: MissionChoice = {
      origin: ORIGINS.eridani40,
      destination: missionDestination(ORIGINS.eridani40, 'tauCeti'),
      accelG: 3,
      coastEta: Math.atanh(0.7),
      crew: 'crewed',
      restRatio: 5,
    };
    const link = parseMissionLink(missionHash(choice));
    expect(link?.choice).toEqual(choice);
  });

  it('cada missão da ficção abre pelo link curto e continua reconhecida no planejamento', () => {
    for (const m of SCIFI_MISSIONS) {
      const choice = parseMissionLink(sciFiHash(m))!.choice!;
      expect(choice).toEqual(sciFiChoice(m, DEFAULT_REST_RATIO));
      // O link completo da mesma missão também a reconhece.
      const full = parseMissionLink(missionHash(choice))!.choice!;
      expect(
        findSciFiMission({
          originId: full.origin.id,
          destinationId: full.destination.id,
          crew: full.crew,
          accelG: full.accelG,
          coastEta: full.coastEta,
        })?.id,
      ).toBe(m.id);
    }
    expect(parseMissionLink(sciFiHash(SCIFI_MISSIONS[0]!, 5))?.choice?.restRatio).toBe(5);
  });

  it('o menu da ficção abre pela aba', () => {
    expect(parseMissionLink(SCIFI_TAB_HASH)).toEqual({ tab: 'scifi' });
  });

  it('sem parâmetros ou com uma missão inválida, nada a carregar', () => {
    expect(parseMissionLink('#viagem')).toBeNull();
    expect(parseMissionLink('#sondas?d=proxima&g=1')).toBeNull();
    expect(parseMissionLink('#viagem?d=vega&g=1')).toBeNull();
    expect(parseMissionLink('#viagem?d=proxima&g=0')).toBeNull();
    expect(parseMissionLink('#viagem?d=proxima&g=1e9')).toBeNull();
    expect(parseMissionLink('#viagem?d=proxima&g=abc')).toBeNull();
    expect(parseMissionLink('#viagem?d=proxima&g=1&e=-1')).toBeNull();
  });

  it('corrige o que o planejamento não permitiria', () => {
    // Partir e chegar em 40 Eridani A: volta à partida da Terra.
    expect(parseMissionLink('#viagem?o=eridani40&d=eridani40&g=1&c=crewed')?.choice?.origin).toBe(ORIGINS.sol);
    // Eridianos só partem de Erid; tripulação desconhecida vira piloto humano; descanso fora da lista, o padrão.
    expect(parseMissionLink(`#viagem?d=tauCeti&g=${ERID_G}&c=eridian`)?.choice?.crew).toBe('crewed');
    expect(parseMissionLink('#viagem?d=tauCeti&g=1&c=gato&r=7')?.choice).toMatchObject({ crew: 'crewed', restRatio: 3 });
    // Cruzeiro acima do pico da aceleração: limitado como no embarque (vira quase o Flip-and-Burn).
    const fast = parseMissionLink('#viagem?d=proxima&g=1&c=robotic&e=50')!.choice!;
    expect(fast.coastEta).toBeLessThan(50);
    expect(fast.coastEta).toBeGreaterThan(1);
  });
});

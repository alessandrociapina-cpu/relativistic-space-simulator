import { useEffect } from 'react';
import { onFlightEvent } from '../store/flightEvents';
import { useFlightStore, type FlightStore } from '../store/useFlightStore';
import { flightAudio } from './FlightAudio';
import { engineSound, isThrusting } from './engineSound';
import './audioSettings';

// Gestos que contam como ativação do usuário para liberar o áudio
// (pointerup cobre o toque, que não ativa no pointerdown).
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'keydown'] as const;

function syncEngine(s: FlightStore): void {
  flightAudio.updateEngine(engineSound(s.flight.gamma, isThrusting(s.playing, s.flight.phase)));
}

/** Liga o sintetizador ao estado de voo e aos eventos do loop de tempo próprio. */
export function useFlightAudio(): void {
  useEffect(() => {
    const unlock = () => flightAudio.unlock();
    const onVisibility = () => (document.hidden ? flightAudio.suspend() : flightAudio.unlock());
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
    document.addEventListener('visibilitychange', onVisibility);
    const offEvents = onFlightEvent((event) => flightAudio.play(event));
    const offStore = useFlightStore.subscribe(syncEngine);
    // De volta ao cockpit (vindo do simulador de sondas): o motor volta a soar.
    flightAudio.resume();

    return () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
      document.removeEventListener('visibilitychange', onVisibility);
      offEvents();
      offStore();
      flightAudio.suspend();
    };
  }, []);
}

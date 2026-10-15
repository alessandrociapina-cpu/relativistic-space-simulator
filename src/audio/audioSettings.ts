import { create } from 'zustand';
import { flightAudio } from './FlightAudio';

const STORAGE_KEY = 'relsim:sound';

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface AudioSettings {
  readonly enabled: boolean;
  /** Chamar a partir do clique: o AudioContext precisa nascer dentro do gesto. */
  toggle: () => void;
}

export const useAudioSettings = create<AudioSettings>()((set, get) => ({
  enabled: loadEnabled(),
  toggle: () => {
    const enabled = !get().enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // sem armazenamento: a escolha vale só nesta sessão
    }
    flightAudio.setEnabled(enabled);
    if (enabled) flightAudio.unlock();
    set({ enabled });
  },
}));

flightAudio.setEnabled(useAudioSettings.getState().enabled);

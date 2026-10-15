import { create } from 'zustand';
import { computeFlightState, type FlightState, type MissionProfile } from '../physics/RelativityEngine';
import { DESTINATIONS, destinationMissionProfile, type Destination } from '../physics/destinations';

// Estado cinemático global em 64 bits. Os componentes 3D leem com
// `useFlightStore.getState()` dentro do useFrame, sem re-render do React.
// Por enquanto só posiciona a nave num instante τ; modos de voo, loop de
// tempo próprio e Auto-Step Down entram com o FlightControls.
interface FlightStore {
  readonly destination: Destination;
  readonly profile: MissionProfile;
  readonly flight: FlightState;
  setTau: (tau: number) => void;
}

const initialDestination = DESTINATIONS.proxima;
const initialProfile = destinationMissionProfile(initialDestination);

export const useFlightStore = create<FlightStore>()((set, get) => ({
  destination: initialDestination,
  profile: initialProfile,
  flight: computeFlightState(initialProfile, 0),
  setTau: (tau) => set({ flight: computeFlightState(get().profile, tau) }),
}));

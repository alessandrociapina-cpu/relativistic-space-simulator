import { MainViewport } from './components/MainViewport';
import { RearCameraPIP } from './components/RearCameraPIP';
import { TelescopePIP } from './components/TelescopePIP';
import { JULIAN_YEAR_S } from './physics/RelativityEngine';
import { useFlightStore } from './store/useFlightStore';

const SCRUB_STEPS = 2000;

// Provisório: posiciona a nave num instante τ da missão até o FlightControls
// (modos Autopilot/Manual, multiplicador de tempo) substituí-lo.
function ProvisionalTimeline() {
  const flight = useFlightStore((s) => s.flight);
  const tauTotal = useFlightStore((s) => s.profile.tauTotal);
  const destinationName = useFlightStore((s) => s.destination.name);
  const setTau = useFlightStore((s) => s.setTau);

  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8 font-mono text-xs text-slate-300">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span className="text-cyan-300">{destinationName}</span>
          <span>τ {flight.tau.toFixed(1)} s</span>
          <span>γ {flight.gamma < 1e4 ? flight.gamma.toFixed(3) : flight.gamma.toExponential(3)}</span>
          <span>t {(flight.earthTimeS / JULIAN_YEAR_S).toFixed(4)} anos</span>
        </div>
        <input
          type="range"
          aria-label="Tempo próprio de bordo"
          className="w-full accent-cyan-400"
          min={0}
          max={SCRUB_STEPS}
          value={Math.round((flight.tau / tauTotal) * SCRUB_STEPS)}
          onChange={(e) => setTau((Number(e.target.value) / SCRUB_STEPS) * tauTotal)}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none">
      <MainViewport className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <TelescopePIP className="pointer-events-auto w-[44%] max-w-xs" />
        <RearCameraPIP className="pointer-events-auto w-[44%] max-w-xs" />
      </div>
      <ProvisionalTimeline />
    </div>
  );
}

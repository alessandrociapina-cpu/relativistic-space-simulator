import type { FlightPhase } from '../physics/RelativityEngine';
import { CMB_VISIBLE_GAMMA, activeWindowsAt } from '../physics/criticalEvents';
import { useFlightStore } from '../store/useFlightStore';
import { formatDistance, formatDuration, formatFixed, formatGamma, formatVelocity } from '../ui/format';

const PHASE_LABEL: Readonly<Record<FlightPhase, string>> = {
  accelerating: 'Aceleração',
  decelerating: 'Frenagem',
  arrived: 'Chegada',
  cruise: 'Cruzeiro livre',
};

interface ReadoutProps {
  label: string;
  /** Símbolo grego fora do `uppercase` (que transformaria τ em Τ). */
  symbol?: string;
  value: string;
  detail?: string;
}

function Readout({ label, symbol, value, detail }: ReadoutProps) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9px] tracking-widest text-cyan-300/70">
        <span className="uppercase">{label}</span>
        {symbol && <span className="ml-1 text-[10px] tracking-normal">{symbol}</span>}
      </div>
      <div className="truncate text-xs text-slate-100 tabular-nums sm:text-sm">{value}</div>
      {detail && <div className="truncate text-[10px] text-slate-500 tabular-nums">{detail}</div>}
    </div>
  );
}

/** Telemetria: relógios da nave e da Terra, γ, velocidade e distâncias. */
export function TelemetryHUD({ className = '' }: { className?: string }) {
  const flight = useFlightStore((s) => s.flight);
  const mode = useFlightStore((s) => s.mode);
  const windows = useFlightStore((s) => s.criticalWindows);
  const tauHalf = useFlightStore((s) => s.profile.tauHalf);

  const cmbVisible = flight.gamma >= CMB_VISIBLE_GAMMA.min && flight.gamma <= CMB_VISIBLE_GAMMA.max;
  const preFlip =
    mode === 'autopilot' && activeWindowsAt(windows, flight.tau).some((w) => w.kind === 'pre-flip');

  return (
    <section
      aria-label="Telemetria"
      className={`rounded-md border border-cyan-400/30 bg-black/70 px-3 py-2 font-mono backdrop-blur-sm ${className}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] tracking-widest uppercase">
        <span className="text-cyan-300">{PHASE_LABEL[flight.phase]}</span>
        {cmbVisible && (
          <span className="rounded-sm bg-amber-400/90 px-1.5 text-black">CMB no visível</span>
        )}
        {preFlip && (
          <span className="rounded-sm bg-rose-500/90 px-1.5 text-black">
            Flip em <span className="normal-case">{formatDuration(Math.max(0, tauHalf - flight.tau))}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 lg:grid-cols-6">
        <Readout label="Relógio nave" symbol="τ" value={formatDuration(flight.tau)} />
        <Readout label="Relógio Terra" symbol="t" value={formatDuration(flight.earthTimeS)} />
        <Readout
          label="Lorentz"
          symbol="γ"
          value={formatGamma(flight.gamma)}
          detail={`η = ${formatFixed(flight.eta, 3)}`}
        />
        <Readout label="Velocidade" value={formatVelocity(flight.beta, flight.oneMinusBeta)} />
        <Readout label="Dist. repouso" value={formatDistance(flight.restDistanceRemainingM)} />
        <Readout label="Dist. contraída" value={formatDistance(flight.contractedDistanceRemainingM)} />
      </div>
    </section>
  );
}

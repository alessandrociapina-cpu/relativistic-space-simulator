import type { ReactNode } from 'react';
import type { FlightPhase } from '../physics/RelativityEngine';
import { formatRelativisticSpeedPercent } from '../physics/EyeAndPhotometry';
import { CMB_VISIBLE_GAMMA, activeWindowsAt } from '../physics/criticalEvents';
import { useFlightStore } from '../store/useFlightStore';
import { formatDistance, formatDuration, formatFixed, formatGamma, formatVelocity } from '../ui/format';

const PHASE_LABEL: Readonly<Record<FlightPhase, string>> = {
  accelerating: 'Aceleração',
  coasting: 'Inércia',
  decelerating: 'Frenagem',
  arrived: 'Chegada',
};

interface ReadoutProps {
  label: string;
  /** Símbolo grego fora do `uppercase` (que transformaria τ em Τ). */
  symbol?: string;
  value: string;
  detail?: string;
  className?: string;
  /** Visor principal (velocidade): números maiores. */
  primary?: boolean;
}

/** Um visor do console: rótulo gravado na chapa e o número luminoso no vidro. */
function Readout({ label, symbol, value, detail, className = '', primary = false }: ReadoutProps) {
  return (
    <div className={`instrument-well min-w-0 rounded-md px-2 py-1 ${className}`}>
      <div className="font-display truncate text-[8px] tracking-[0.2em] text-cyan-300/70 sm:text-[9px]">
        <span className="uppercase">{label}</span>
        {symbol && <span className="font-readout ml-1 text-[10px] tracking-normal text-cyan-200">{symbol}</span>}
      </div>
      <div
        className={`font-readout glow-text truncate whitespace-nowrap text-cyan-50 tabular-nums ${
          primary ? 'text-sm sm:text-lg' : 'text-xs sm:text-[15px]'
        }`}
      >
        {value}
      </div>
      {detail && <div className="font-readout hidden truncate text-[10px] text-slate-400 tabular-nums sm:block">{detail}</div>}
    </div>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`font-display rounded-sm px-1.5 py-px text-[9px] tracking-[0.15em] uppercase ${className}`}>{children}</span>;
}

/**
 * Console de teto: velocidade, γ, relógios da nave e da Terra e distâncias,
 * com os avisos da fase do voo. Ganha fundo fosco quando o white-out da CMB
 * clareia o para-brisa.
 */
export function TelemetryHUD({ className = '' }: { className?: string }) {
  const flight = useFlightStore((s) => s.flight);
  const crew = useFlightStore((s) => s.crew);
  const destination = useFlightStore((s) => s.destination);
  const windows = useFlightStore((s) => s.criticalWindows);
  const brakeStartTau = useFlightStore((s) => s.profile.brakeStartTau);
  const ignitionCountdownS = useFlightStore((s) => s.ignitionCountdownS);
  const isEyeHazard = useFlightStore((s) => s.photometry.isEyeHazard);
  const whiteout = useFlightStore((s) => s.photometry.isWhiteoutHudActive && s.crew === 'crewed');

  const cmbVisible = flight.gamma >= CMB_VISIBLE_GAMMA.min && flight.gamma <= CMB_VISIBLE_GAMMA.max;
  const preFlip = activeWindowsAt(windows, flight.tau).some((w) => w.kind === 'pre-flip');

  return (
    <section
      aria-label="Telemetria"
      className={`hull-panel rounded-b-2xl px-2 pt-[max(0.375rem,env(safe-area-inset-top))] pb-2 transition-[filter] duration-500 sm:px-4 ${
        whiteout ? 'brightness-110 backdrop-blur-md' : ''
      } ${className}`}
    >
      <div className="mx-auto max-w-6xl">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Chip className="border border-cyan-300/50 text-cyan-200">{PHASE_LABEL[flight.phase]}</Chip>
        <Chip
          className={
            crew === 'crewed'
              ? 'border border-sky-300/40 bg-sky-500/10 text-sky-100'
              : 'border border-violet-300/40 bg-violet-500/10 text-violet-100'
          }
        >
          {crew === 'crewed' ? '🧑‍🚀 Piloto humano' : '🤖 Sonda robótica · sem tripulação'}
        </Chip>
        <span className="font-display truncate text-[9px] tracking-[0.15em] text-slate-400 uppercase max-sm:hidden">
          Rumo a {destination.name}
        </span>
        {ignitionCountdownS !== null && (
          <Chip className="animate-beacon bg-cyan-300 text-black">Ignição em {Math.ceil(ignitionCountdownS)}</Chip>
        )}
        {isEyeHazard && crew === 'crewed' && (
          <Chip className="border border-amber-500 bg-amber-950/80 text-amber-200">⚠ Ofuscamento · luz forte à frente</Chip>
        )}
        {cmbVisible && <Chip className="bg-amber-400/90 text-black">CMB no visível</Chip>}
        {preFlip && (
          <Chip className="bg-rose-500/90 text-black">
            Flip em <span className="normal-case">{formatDuration(Math.max(0, brakeStartTau - flight.tau))}</span>
          </Chip>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-8">
        <Readout
          label="Velocidade"
          symbol="v/c"
          value={formatRelativisticSpeedPercent(flight.eta)}
          detail={formatVelocity(flight.beta, flight.oneMinusBeta)}
          className="col-span-3 lg:col-span-2"
          primary
        />
        <Readout label="Lorentz" symbol="γ" value={formatGamma(flight.gamma)} detail={`η = ${formatFixed(flight.eta, 3)}`} />
        <Readout label="Relógio nave" symbol="τ" value={formatDuration(flight.tau)} className="lg:col-span-1" />
        <Readout label="Relógio Terra" symbol="t" value={formatDuration(flight.earthTimeS)} />
        <Readout label="Distância" value={formatDistance(flight.restDistanceRemainingM)} detail="referencial da Terra" className="lg:col-span-1" />
        <Readout
          label="Contraída"
          value={formatDistance(flight.contractedDistanceRemainingM)}
          detail="medida pela nave"
          className="col-span-2 lg:col-span-2"
        />
      </div>
      </div>
    </section>
  );
}

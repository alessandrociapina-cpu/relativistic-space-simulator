import type { ReactNode } from 'react';
import { G0, flipTauOf, type FlightPhase } from '../physics/RelativityEngine';
import { formatRelativisticSpeedPercent } from '../physics/EyeAndPhotometry';
import { findPreset } from '../physics/accelerationPresets';
import { CMB_VISIBLE_GAMMA, activeWindowsAt } from '../physics/criticalEvents';
import { useFlightStore } from '../store/useFlightStore';
import {
  formatAccelG,
  formatDistance,
  formatDuration,
  formatFixed,
  formatGamma,
  formatSpan,
  formatSpeedKms,
  formatVelocity,
} from '../ui/format';
import type { IndicatorId } from '../ui/indicatorHelp';
import { InfoTip } from './InfoTip';

// Verbos, para o selo da fase não se confundir com o visor da aceleração α.
const PHASE_LABEL: Readonly<Record<FlightPhase, string>> = {
  accelerating: 'Acelerando',
  coasting: 'Inércia',
  decelerating: 'Freando',
  arrived: 'Chegada',
  flyby: 'Passou pelo alvo',
};

interface ReadoutProps {
  label: string;
  /** Símbolo grego fora do `uppercase` (que transformaria τ em Τ). */
  symbol?: string;
  /** O ⚠ que abre a explicação do indicador. */
  help: IndicatorId;
  value: string;
  /** Segunda linha, visível também no celular (a velocidade em km/s). */
  sub?: string;
  detail?: string;
  className?: string;
  /** Visor principal (velocidade): números maiores. */
  primary?: boolean;
  /** Visor em âmbar, para se destacar (a aceleração). */
  accent?: boolean;
}

/** Um visor do console: rótulo gravado na chapa e o número luminoso no vidro. */
function Readout({ label, symbol, help, value, sub, detail, className = '', primary = false, accent = false }: ReadoutProps) {
  return (
    <div className={`instrument-well relative min-w-0 rounded-md px-2 py-1 ${accent ? 'border-amber-400/40' : ''} ${className}`}>
      <InfoTip id={help} className="absolute top-0.5 right-0.5" />
      <div
        className={`font-display truncate pr-4 text-[8px] tracking-[0.1em] sm:text-[9px] sm:tracking-[0.2em] ${accent ? 'text-amber-300/80' : 'text-cyan-300/70'}`}
      >
        <span className="uppercase">{label}</span>
        {symbol && (
          <span className={`font-readout ml-1 text-[10px] tracking-normal ${accent ? 'text-amber-200' : 'text-cyan-200'}`}>
            {symbol}
          </span>
        )}
      </div>
      <div
        className={`font-readout glow-text truncate whitespace-nowrap tabular-nums ${accent ? 'text-amber-100' : 'text-cyan-50'} ${
          primary || accent ? 'text-sm sm:text-lg' : 'text-xs sm:text-[15px]'
        }`}
      >
        {value}
      </div>
      {sub && <div className="font-readout truncate text-[11px] text-cyan-100/90 tabular-nums sm:text-xs">{sub}</div>}
      {detail && <div className="font-readout hidden truncate text-[10px] text-slate-400 tabular-nums sm:block">{detail}</div>}
    </div>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`font-display shrink-0 rounded-sm px-1.5 py-px text-[9px] whitespace-nowrap tracking-[0.15em] uppercase ${className}`}>
      {children}
    </span>
  );
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
  // O flip do plano ou o do piloto automático, depois de religar o motor.
  const brakeStartTau = useFlightStore((s) => flipTauOf(s.profile) ?? s.profile.brakeStartTau);
  const ignitionCountdownS = useFlightStore((s) => s.ignitionCountdownS);
  const accelG = useFlightStore((s) => s.accelG);
  const properAccel = useFlightStore((s) => s.plannedProfile.properAccel);
  const isEyeHazard = useFlightStore((s) => s.photometry.isEyeHazard);
  const whiteout = useFlightStore((s) => s.photometry.isWhiteoutHudActive && s.crew === 'crewed');

  const cmbVisible = flight.gamma >= CMB_VISIBLE_GAMMA.min && flight.gamma <= CMB_VISIBLE_GAMMA.max;
  const preFlip = activeWindowsAt(windows, flight.tau).some((w) => w.kind === 'pre-flip');
  // A aceleração própria sentida a bordo: cai até zero quando o motor é desligado.
  const accelDetail =
    flight.engine === 'ramp'
      ? 'desligando o motor'
      : flight.engine === 'off'
        ? flight.phase === 'arrived'
          ? 'motor parado'
          : `motor desligado · ${formatAccelG(accelG)} nas queimas`
        : flight.thrustAccel > properAccel * 1.000001
          ? 'frenagem de emergência'
          : (findPreset(crew, accelG)?.title ?? 'personalizada');

  return (
    <section
      aria-label="Telemetria"
      className={`hull-panel rounded-b-2xl px-2 pt-[max(0.375rem,env(safe-area-inset-top))] pb-2 transition-[filter] duration-500 sm:px-4 ${
        whiteout ? 'brightness-110 backdrop-blur-md' : ''
      } ${className}`}
    >
      <div className="mx-auto max-w-[88rem]">
      {/* Altura fixa (2 linhas no celular, 1 na tela larga): um aviso que muda de largura,
          como a contagem do flip, não empurra o resto do cockpit a cada segundo. */}
      <div className="mb-1.5 flex h-[2.6rem] flex-wrap content-start items-center gap-1 overflow-hidden sm:h-5 sm:gap-1.5">
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
        {ignitionCountdownS !== null && (
          <Chip className="animate-beacon bg-cyan-300 text-black">Ignição em {Math.ceil(ignitionCountdownS)}</Chip>
        )}
        {isEyeHazard && crew === 'crewed' && (
          <Chip className="border border-amber-500 bg-amber-950/80 text-amber-200">⚠ Ofuscamento · luz forte à frente</Chip>
        )}
        {cmbVisible && <Chip className="bg-amber-400/90 text-black">CMB no visível</Chip>}
        {preFlip && (
          <Chip className="bg-rose-500/90 text-black">
            Flip em{' '}
            <span className="font-readout inline-block min-w-[5.5em] text-[10px] tracking-normal normal-case tabular-nums">
              {formatSpan(Math.max(0, brakeStartTau - flight.tau))}
            </span>
          </Chip>
        )}
        {/* Por último: quando os avisos ocupam as linhas, é o destino que sai de vista. */}
        <span className="font-display min-w-0 truncate text-[9px] tracking-[0.15em] text-slate-400 uppercase">
          Rumo a {destination.name}
        </span>
      </div>
      {/* Três colunas no celular, cinco (duas fileiras) na tela média e uma fileira só
          na larga, com as colunas proporcionais ao texto de cada visor. */}
      <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-5 xl:grid-cols-[2.2fr_1fr_1fr_1.25fr_1.25fr_1.2fr_1.6fr]">
        <Readout
          label="Velocidade"
          symbol="v/c"
          help="velocity"
          value={formatRelativisticSpeedPercent(flight.eta)}
          sub={formatSpeedKms(flight.beta)}
          detail={formatVelocity(flight.beta, flight.oneMinusBeta)}
          className="col-span-2 xl:col-span-1"
          primary
        />
        <Readout label="Aceleração" symbol="α" help="acceleration" value={formatAccelG(flight.thrustAccel / G0)} detail={accelDetail} accent />
        <Readout label="Lorentz" symbol="γ" help="lorentz" value={formatGamma(flight.gamma)} detail={`η = ${formatFixed(flight.eta, 3)}`} />
        <Readout label="Relógio nave" symbol="τ" help="shipClock" value={formatDuration(flight.tau)} />
        <Readout label="Relógio Terra" symbol="t" help="earthClock" value={formatDuration(flight.earthTimeS)} />
        <Readout
          label="Distância"
          help="distance"
          value={formatDistance(flight.restDistanceRemainingM)}
          detail="referencial da Terra"
          className="lg:col-span-2 xl:col-span-1"
        />
        <Readout
          label="Contraída"
          help="contracted"
          value={formatDistance(flight.contractedDistanceRemainingM)}
          detail="medida pela nave"
          className="col-span-2 xl:col-span-1"
        />
      </div>
      </div>
    </section>
  );
}

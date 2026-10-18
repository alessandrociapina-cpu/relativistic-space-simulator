import { blackbodyCssColor } from '../physics/blackbody';
import { AU_M, arrivalDistanceM, targetViewDistanceM } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';
import { formatRouteDistance } from '../ui/format';
import { OORT_CLOUD_AU, SATURN_AU, routeGeometry, routePosition, sunMarkerPosition } from '../ui/routeScale';
import { CockpitMonitor } from './CockpitMonitor';
import { InfoTip } from './InfoTip';

const X0 = 24;
const X1 = 296;
const LINE_Y = 104;
const xAt = (u: number) => X0 + (X1 - X0) * u;
/** Menor distância entre dois marcos no mapa (fração da largura) para os rótulos não se sobreporem. */
const MARKER_MIN_GAP = 0.2;

/** Estado da rota, comum ao monitor e à faixa do painel no celular. */
function useRoute() {
  const flight = useFlightStore((s) => s.flight);
  const profile = useFlightStore((s) => s.profile);
  const destination = useFlightStore((s) => s.destination);
  const origin = useFlightStore((s) => s.origin);
  const playing = useFlightStore((s) => s.playing);

  const geometry = routeGeometry(profile, arrivalDistanceM(destination), origin.homeOrbitM);
  const halfwayAu = geometry.halfwaySunDistanceM / AU_M;
  // Saturno e a Nuvem de Oort só na partida do Sol.
  const markers = (origin.solarSystem
    ? [
        { au: SATURN_AU, label: 'DISTÂNCIA DE SATURNO' },
        { au: OORT_CLOUD_AU, label: 'NUVEM DE OORT' },
      ]
    : []
  )
    .filter((m) => m.au < halfwayAu)
    .map((m) => ({ ...m, u: sunMarkerPosition(m.au, geometry) }))
    // Nas viagens muito longas, a escala log junta Saturno e a Nuvem de Oort perto do Sol: fica só o mais distante.
    .filter((m, i, all) => all.every((o, j) => j <= i || o.u - m.u > MARKER_MIN_GAP));

  const status =
    flight.phase === 'arrived'
      ? 'CHEGADA'
      : flight.phase === 'flyby'
        ? 'PASSOU PELO ALVO'
        : flight.engine === 'ramp'
          ? 'DESLIGANDO O MOTOR'
          : flight.phase === 'coasting'
            ? flight.crewRest
              ? 'DESCANSO'
              : 'INÉRCIA'
            : flight.phase === 'decelerating'
              ? '◂◂ FREANDO'
              : playing || flight.tau > 0
                ? 'ACELERANDO ▸▸'
                : 'PRONTA';

  return {
    destination,
    origin,
    markers,
    status,
    shipU: routePosition(flight, profile, geometry),
    fromSun: formatRouteDistance(origin.homeOrbitM + flight.positionM),
    toTarget: formatRouteDistance(targetViewDistanceM(flight, destination)),
  };
}

function RouteMap() {
  const { destination, origin, markers, status, shipU, fromSun, toTarget } = useRoute();
  const shipX = xAt(shipU);

  return (
    <svg viewBox="0 0 320 240" className="font-readout absolute inset-0 h-full w-full" aria-label="Mapa da rota">
      <defs>
        <pattern id="route-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#0e7490" strokeOpacity="0.18" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="320" height="240" fill="url(#route-grid)" />
      <line x1={X0} y1={LINE_Y} x2={X1} y2={LINE_Y} stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="1.5" />
      {/* Marcos intermediários: tique na linha e rótulo na segunda fileira. */}
      {markers.map((m) => {
        const x = xAt(m.u);
        return (
          <g key={m.label}>
            <line x1={x} y1={LINE_Y - 5} x2={x} y2={LINE_Y + 5} stroke="#94a3b8" />
            <line x1={x} y1={LINE_Y + 5} x2={x} y2={LINE_Y + 28} stroke="#94a3b8" strokeOpacity="0.35" />
            <text x={x} y={LINE_Y + 38} fill="#94a3b8" fontSize="7.5" textAnchor="middle">
              {m.label}
            </text>
          </g>
        );
      })}
      <line x1={xAt(0.5)} y1={LINE_Y - 9} x2={xAt(0.5)} y2={LINE_Y + 9} stroke="#e2e8f0" strokeOpacity="0.7" />
      <text x={xAt(0.5)} y={LINE_Y + 20} fill="#e2e8f0" fontSize="8.5" textAnchor="middle">
        METADE
      </text>

      <circle cx={X0} cy={LINE_Y} r="6" fill={blackbodyCssColor(origin.starTempK)} />
      <text x={X0 - 4} y={LINE_Y + 20} fill="#fde047" fontSize="8.5" textAnchor="start">
        {origin.shortName}
      </text>
      <circle cx={X1} cy={LINE_Y} r="6" fill={blackbodyCssColor(destination.temperatureK)} />
      <text x={X1 + 4} y={LINE_Y + 20} fill="#fca5a5" fontSize="8.5" textAnchor="end">
        {destination.shortName}
      </text>

      {/* Nave: marcador acima da linha e estado do motor. */}
      <line x1={shipX} y1={LINE_Y - 34} x2={shipX} y2={LINE_Y - 12} stroke="#f59e0b" strokeOpacity="0.5" strokeDasharray="2 2" />
      <path d={`M ${shipX} ${LINE_Y - 3} l -5 -9 h 10 z`} fill="#f59e0b" />
      <text
        x={Math.min(Math.max(shipX, 60), 260)}
        y={LINE_Y - 40}
        fill="#f59e0b"
        fontSize="9"
        textAnchor="middle"
        letterSpacing="1"
      >
        {status}
      </text>

      <text x="24" y="196" fill="#94a3b8" fontSize="8.5" letterSpacing="1">
        {origin.solarSystem ? 'DO SOL' : `DE ${origin.shortName}`}
      </text>
      <text x="24" y="214" fill="#e2e8f0" fontSize="14">
        {fromSun}
      </text>
      <text x="296" y="196" fill="#94a3b8" fontSize="8.5" letterSpacing="1" textAnchor="end">
        ATÉ {destination.shortName}
      </text>
      <text x="296" y="214" fill="#e2e8f0" fontSize="14" textAnchor="end">
        {toTarget}
      </text>
    </svg>
  );
}

const STRIP_X0 = 8;
const STRIP_X1 = 292;
const STRIP_Y = 15;
const stripX = (u: number) => STRIP_X0 + (STRIP_X1 - STRIP_X0) * u;

/**
 * A rota no painel do celular, onde não há telas penduradas: a mesma escala log
 * do monitor numa faixa, com o estado do motor e as distâncias.
 */
export function RouteStrip({ className = '' }: { className?: string }) {
  const { destination, origin, markers, status, shipU, fromSun, toTarget } = useRoute();
  const shipX = stripX(shipU);
  return (
    <div className={`instrument-well min-w-0 rounded-md px-2 py-1 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display flex items-center gap-1 text-[8px] tracking-[0.22em] text-slate-400 uppercase">
          Rota · escala log <InfoTip id="route" />
        </span>
        <span className="font-readout text-[10px] tracking-wider text-amber-400">{status}</span>
      </div>
      <svg viewBox="0 0 300 22" className="block w-full" aria-label="Mapa da rota">
        <line x1={STRIP_X0} y1={STRIP_Y} x2={STRIP_X1} y2={STRIP_Y} stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="1.2" />
        {markers.map((m) => (
          <line key={m.label} x1={stripX(m.u)} y1={STRIP_Y - 3} x2={stripX(m.u)} y2={STRIP_Y + 3} stroke="#94a3b8">
            <title>{m.label}</title>
          </line>
        ))}
        <line x1={stripX(0.5)} y1={STRIP_Y - 5} x2={stripX(0.5)} y2={STRIP_Y + 5} stroke="#e2e8f0" strokeOpacity="0.7" />
        <circle cx={STRIP_X0} cy={STRIP_Y} r="4" fill={blackbodyCssColor(origin.starTempK)} />
        <circle cx={STRIP_X1} cy={STRIP_Y} r="4" fill={blackbodyCssColor(destination.temperatureK)} />
        <path d={`M ${shipX} ${STRIP_Y - 2} l -4.5 -8 h 9 z`} fill="#f59e0b" />
      </svg>
      {/* Colunas iguais nas pontas: METADE fica exatamente sob o tique do meio. */}
      <div className="font-readout grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 text-[10px] tabular-nums">
        <span className="min-w-0 truncate">
          <span className="text-yellow-300">{origin.shortName}</span> <span className="text-slate-200">{fromSun}</span>
        </span>
        <span className="text-slate-400">METADE</span>
        <span className="min-w-0 truncate text-right">
          <span className="text-slate-200">{toTarget}</span> <span className="text-rose-300">{destination.shortName}</span>
        </span>
      </div>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: string }) {
  return (
    <div className="instrument-well flex min-w-0 flex-col items-center rounded-sm px-1 py-0.5">
      <span className="font-display truncate text-[7px] tracking-[0.12em] text-cyan-300/70 uppercase sm:text-[8px]">{label}</span>
      <span className="font-readout text-[11px] leading-tight text-cyan-50 tabular-nums sm:text-xs">{value}</span>
    </div>
  );
}

/** Progresso do voo, embaixo do mapa (na altura das teclas do telescópio). */
function RouteFooter() {
  const distance = useFlightStore((s) => Math.round((100 * s.flight.positionM) / s.profile.distanceM));
  const time = useFlightStore((s) => Math.round((100 * s.flight.tau) / s.profile.tauTotal));
  const earth = useFlightStore((s) => Math.round((100 * s.flight.earthTimeS) / s.profile.tTotal));
  const home = useFlightStore((s) => s.origin.homeName);
  return (
    <div className="hidden grid-cols-3 gap-1 px-0.5 pt-1 sm:grid">
      <Gauge label="Percurso" value={`${distance} %`} />
      <Gauge label="Bordo" value={`${time} %`} />
      <Gauge label={home} value={`${earth} %`} />
    </div>
  );
}

/** Monitor direito: a rota em escala logarítmica, da estrela de partida ao alvo. */
export function RouteMonitor({ className = '' }: { className?: string }) {
  const origin = useFlightStore((s) => s.origin);
  const destination = useFlightStore((s) => s.destination);
  return (
    <CockpitMonitor
      title="Rota · escala log"
      subtitle={`${origin.homeName} → ${destination.shortName.toLowerCase()}`}
      className={className}
      tilt="right"
      help="route"
      footer={<RouteFooter />}
    >
      <RouteMap />
    </CockpitMonitor>
  );
}

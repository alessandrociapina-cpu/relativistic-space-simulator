import { blackbodyCssColor } from '../physics/blackbody';
import { AU_M, arrivalDistanceM, targetViewDistanceM } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';
import { formatRouteDistance } from '../ui/format';
import { OORT_CLOUD_AU, SATURN_AU, routeGeometry, routePosition, sunMarkerPosition } from '../ui/routeScale';
import { CockpitMonitor } from './CockpitMonitor';

const X0 = 24;
const X1 = 296;
const LINE_Y = 104;
const xAt = (u: number) => X0 + (X1 - X0) * u;

function RouteMap() {
  const flight = useFlightStore((s) => s.flight);
  const profile = useFlightStore((s) => s.profile);
  const destination = useFlightStore((s) => s.destination);
  const playing = useFlightStore((s) => s.playing);

  const arrival = arrivalDistanceM(destination);
  const geometry = routeGeometry(profile, arrival);
  const halfwayAu = geometry.halfwaySunDistanceM / AU_M;
  const shipX = xAt(routePosition(flight, profile, geometry));
  const markers = [
    { au: SATURN_AU, label: 'DISTÂNCIA DE SATURNO' },
    { au: OORT_CLOUD_AU, label: 'NUVEM DE OORT' },
  ].filter((m) => m.au < halfwayAu);

  const status =
    flight.phase === 'coasting'
      ? 'INÉRCIA'
      : flight.phase === 'arrived'
        ? 'CHEGADA'
        : flight.phase === 'decelerating'
          ? '◂◂ FREANDO'
          : playing || flight.tau > 0
            ? 'ACELERANDO ▸▸'
            : 'PRONTA';

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
        const x = xAt(sunMarkerPosition(m.au, geometry));
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

      <circle cx={X0} cy={LINE_Y} r="6" fill="#fde047" />
      <text x={X0} y={LINE_Y + 20} fill="#fde047" fontSize="8.5" textAnchor="middle">
        SOL
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
        DO SOL
      </text>
      <text x="24" y="214" fill="#e2e8f0" fontSize="14">
        {formatRouteDistance(AU_M + flight.positionM)}
      </text>
      <text x="296" y="196" fill="#94a3b8" fontSize="8.5" letterSpacing="1" textAnchor="end">
        ATÉ {destination.shortName}
      </text>
      <text x="296" y="214" fill="#e2e8f0" fontSize="14" textAnchor="end">
        {formatRouteDistance(targetViewDistanceM(flight, destination))}
      </text>
    </svg>
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
  return (
    <div className="hidden grid-cols-3 gap-1 px-0.5 pt-1 sm:grid">
      <Gauge label="Percurso" value={`${distance} %`} />
      <Gauge label="Bordo" value={`${time} %`} />
      <Gauge label="Terra" value={`${earth} %`} />
    </div>
  );
}

/** Monitor direito: a rota em escala logarítmica, do Sol ao alvo. */
export function RouteMonitor({ className = '' }: { className?: string }) {
  return (
    <CockpitMonitor
      title="Rota · escala log"
      subtitle="Sol → metade → alvo"
      className={className}
      tilt="right"
      footer={<RouteFooter />}
    >
      <RouteMap />
    </CockpitMonitor>
  );
}

import { useState } from 'react';
import { blackbodyCssColor } from '../physics/blackbody';
import { missionScaledS } from '../physics/criticalEvents';
import { AU_M, arrivalDistanceM } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';
import { formatRouteDistance } from '../ui/format';
import { OORT_CLOUD_AU, SATURN_AU, routeGeometry, routePosition, sunMarkerPosition } from '../ui/routeScale';
import { CockpitMonitor, MonitorButtons } from './CockpitMonitor';
import { REAR_VIEW_ZOOM, RearCameraView } from './RearCameraView';

type RightMonitorChoice = 'auto' | 'route' | 'rear';

/** Nos últimos 20 s da frenagem (na escala da missão) o monitor passa sozinho para a câmera traseira. */
const REAR_VIEW_SWITCH_S = 20;

const CHOICES = [
  { value: 'auto', label: 'AUTO', title: 'Rota durante o voo, traseira na reta final' },
  { value: 'route', label: 'ROTA', title: 'Mapa da rota em escala logarítmica' },
  { value: 'rear', label: 'TRÁS', title: `Câmera traseira (x ${REAR_VIEW_ZOOM})` },
] as const;

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
    { au: SATURN_AU, label: "SATURN'S DISTANCE" },
    { au: OORT_CLOUD_AU, label: 'OORT CLOUD' },
  ].filter((m) => m.au < halfwayAu);

  const status =
    flight.phase === 'cruise' || flight.phase === 'coasting'
      ? 'COASTING'
      : flight.phase === 'arrived'
        ? 'ARRIVED'
        : flight.phase === 'decelerating'
          ? '◂◂ BRAKING'
          : playing || flight.tau > 0
            ? 'ACCELERATING ▸▸'
            : 'READY';

  return (
    <svg viewBox="0 0 320 240" className="absolute inset-0 h-full w-full font-mono" aria-label="Mapa da rota">
      <line x1={X0} y1={LINE_Y} x2={X1} y2={LINE_Y} stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="1.5" />
      {/* Marcos intermediários: tique na linha e rótulo na segunda fileira. */}
      {markers.map((m) => {
        const x = xAt(sunMarkerPosition(m.au, geometry));
        return (
          <g key={m.label}>
            <line x1={x} y1={LINE_Y - 5} x2={x} y2={LINE_Y + 5} stroke="#94a3b8" />
            <line x1={x} y1={LINE_Y + 5} x2={x} y2={LINE_Y + 28} stroke="#94a3b8" strokeOpacity="0.35" />
            <text x={x} y={LINE_Y + 38} fill="#94a3b8" fontSize="7" textAnchor="middle">
              {m.label}
            </text>
          </g>
        );
      })}
      <line x1={xAt(0.5)} y1={LINE_Y - 9} x2={xAt(0.5)} y2={LINE_Y + 9} stroke="#e2e8f0" strokeOpacity="0.7" />
      <text x={xAt(0.5)} y={LINE_Y + 20} fill="#e2e8f0" fontSize="8" textAnchor="middle">
        HALFWAY
      </text>

      <circle cx={X0} cy={LINE_Y} r="6" fill="#fde047" />
      <text x={X0} y={LINE_Y + 20} fill="#fde047" fontSize="8" textAnchor="middle">
        SUN
      </text>
      <circle cx={X1} cy={LINE_Y} r="6" fill={blackbodyCssColor(destination.temperatureK)} />
      <text x={X1 + 4} y={LINE_Y + 20} fill="#fca5a5" fontSize="8" textAnchor="end">
        {destination.shortName}
      </text>

      {/* Nave: marcador acima da linha e estado do motor. */}
      <line x1={shipX} y1={LINE_Y - 34} x2={shipX} y2={LINE_Y - 12} stroke="#f59e0b" strokeOpacity="0.5" strokeDasharray="2 2" />
      <path d={`M ${shipX} ${LINE_Y - 3} l -5 -9 h 10 z`} fill="#f59e0b" />
      <text
        x={Math.min(Math.max(shipX, 60), 260)}
        y={LINE_Y - 40}
        fill="#f59e0b"
        fontSize="8"
        textAnchor="middle"
        letterSpacing="1"
      >
        {status}
      </text>

      <text x="24" y="196" fill="#94a3b8" fontSize="8" letterSpacing="1">
        FROM THE SUN
      </text>
      <text x="24" y="214" fill="#e2e8f0" fontSize="13">
        {formatRouteDistance(AU_M + flight.positionM)}
      </text>
      <text x="296" y="196" fill="#94a3b8" fontSize="8" letterSpacing="1" textAnchor="end">
        TO {destination.shortName}
      </text>
      <text x="296" y="214" fill="#e2e8f0" fontSize="13" textAnchor="end">
        {formatRouteDistance(flight.restDistanceRemainingM + arrival)}
      </text>
    </svg>
  );
}

/** Monitor direito: rota em escala logarítmica durante o voo, câmera traseira no fim. */
export function RouteMapAndRearMonitor({ className = '' }: { className?: string }) {
  const [choice, setChoice] = useState<RightMonitorChoice>('auto');
  const nearArrival = useFlightStore(
    (s) =>
      s.mode === 'autopilot' &&
      s.flight.tau > 0 &&
      s.profile.tauTotal - s.flight.tau <= missionScaledS(s.profile, REAR_VIEW_SWITCH_S),
  );
  const showRear = choice === 'rear' || (choice === 'auto' && nearArrival);

  return (
    <CockpitMonitor
      title={
        showRear ? (
          <>
            REAR VIEW · <span className="normal-case">x</span> {REAR_VIEW_ZOOM}
          </>
        ) : (
          'ROUTE · LOG SCALE'
        )
      }
      subtitle={showRear ? 'Sol' : undefined}
      className={className}
      footer={<MonitorButtons label="Monitor direito" options={CHOICES} value={choice} onChange={setChoice} />}
    >
      {showRear ? <RearCameraView /> : <RouteMap />}
    </CockpitMonitor>
  );
}

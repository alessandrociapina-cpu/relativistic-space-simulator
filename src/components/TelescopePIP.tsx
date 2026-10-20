import '../quietThree';
import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { WINDSHIELD_FOV_DEG, recommendedRearZoom } from '../physics/EyeAndPhotometry';
import { computeBodyAngularRadii } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';
import { useCockpitUi, type TelescopeDirection } from '../ui/cockpitUi';
import { formatScientific, formatSpaceNumber } from '../ui/format';
import { CockpitMonitor, MonitorButtons } from './CockpitMonitor';
import { RelativisticSky, SensorMode, type SkyReadout } from './RelativisticSky';
import { TelescopeLabelLayer, TelescopeLabelTracker } from './TelescopeLabels';

const SENSORS = [
  { value: SensorMode.Visible, label: 'VIS', title: 'Visível (380–750 nm)' },
  { value: SensorMode.Infrared, label: 'IV', title: 'Infravermelho' },
  { value: SensorMode.Ultraviolet, label: 'UV', title: 'Ultravioleta' },
  { value: SensorMode.XRay, label: 'RX', title: 'Raios X' },
] as const;

const DIRECTIONS = [
  { value: 'rear', label: 'TRÁS', title: 'Telescópio voltado para a estrela de partida (o Sol), atrás da nave' },
  { value: 'front', label: 'FRENTE', title: 'Telescópio voltado para o alvo, à frente' },
] as const;

type FlightStoreState = ReturnType<typeof useFlightStore.getState>;

/** Quanto cada sensor desloca o espectro (o mesmo `scaleFactor` do shader). */
const SENSOR_SCALE: Readonly<Record<SensorMode, number>> = {
  [SensorMode.Visible]: 1,
  [SensorMode.Infrared]: 12,
  [SensorMode.Ultraviolet]: 0.15,
  [SensorMode.XRay]: 0.01,
};
/** Abaixo disso, na escala do sensor, um corpo negro fica escuro demais para aparecer. */
const SENSOR_DARK_K = 1000;

/**
 * Atrás, a estrela de partida vista com o Doppler e^(−η): "ir" se ela sumiu deste sensor mas o infravermelho
 * ainda a pega, "front" se sumiu de todos (só resta virar para a frente), null se aparece.
 */
function rearHint(apparentK: number, sensor: SensorMode): 'ir' | 'front' | null {
  if (apparentK * SENSOR_SCALE[sensor] >= SENSOR_DARK_K) return null;
  return sensor !== SensorMode.Infrared && apparentK * SENSOR_SCALE[SensorMode.Infrared] >= SENSOR_DARK_K ? 'ir' : 'front';
}

/** Zoom do instante: à frente acompanha o cone e o alvo; atrás, enquadra a estrela de partida. */
function telescopeZoom({ flight, destination, origin, photometry }: FlightStoreState, direction: TelescopeDirection): number {
  if (direction === 'front') return photometry.recommendedTelescopeZoom;
  return recommendedRearZoom(flight.eta, computeBodyAngularRadii(flight, destination, origin).sunRadiusRad);
}

/**
 * Zoom do título, que divide a largura com o alvo: inteiro abaixo de 10⁶ ("475 000"), depois em notação
 * científica compacta ("5,33×10¹¹" rumo a Andrômeda, em vez de "533 000 000 000").
 */
const formatZoom = (zoom: number) => (zoom < 1e6 ? formatSpaceNumber(zoom) : formatScientific(zoom).replace(' × ', '×'));

/** Aponta a câmera e aplica o auto-zoom antes do céu ler o FOV no mesmo frame. */
function Aim({ direction }: { direction: TelescopeDirection }) {
  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera;
    const yaw = direction === 'rear' ? Math.PI : 0;
    if (cam.rotation.y !== yaw) cam.rotation.set(0, yaw, 0);
    const fov = WINDSHIELD_FOV_DEG / telescopeZoom(useFlightStore.getState(), direction);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function TelescopeTitle({ direction }: { direction: TelescopeDirection }) {
  // Três algarismos significativos: o zoom acompanha γ e, inteiro, mudaria a cada frame na aceleração.
  const zoom = useFlightStore((s) => Number(Math.round(telescopeZoom(s, direction)).toPrecision(3)));
  return (
    <>
      Telescópio · {direction === 'rear' ? 'trás' : 'frente'} · <span className="normal-case">x</span> {formatZoom(zoom)}
    </>
  );
}

/**
 * Monitor esquerdo: telescópio multiespectral com auto-zoom. Atrás (padrão),
 * acompanha o Sol, que a aberração amplia e o Doppler leva ao infravermelho;
 * à frente, o alvo e o cone comprimido da CMB.
 */
export function TelescopePIP({ className = '' }: { className?: string }) {
  const [sensorMode, setSensorMode] = useState<SensorMode>(SensorMode.Visible);
  const direction = useCockpitUi((s) => s.telescopeDirection);
  const setDirection = useCockpitUi((s) => s.setTelescopeDirection);
  const target = useFlightStore((s) => s.destination.shortName);
  const originStar = useFlightStore((s) => s.origin.starName);
  const starSubject = originStar === 'Sol' ? 'O Sol' : originStar;
  const hint = useFlightStore((s) => (direction === 'rear' ? rearHint(s.origin.starTempK * Math.exp(-s.flight.eta), sensorMode) : null));
  // O céu conta ao rastreador dos rótulos a exposição e a PSF de cada quadro; os nós dos rótulos ficam fixos.
  const readout = useRef<SkyReadout>({ exposure: 1, backgroundGain: 1, psfAngleRad: 1e-3 }).current;
  const labelNodes = useRef<(HTMLDivElement | null)[]>([]);

  return (
    <CockpitMonitor
      title={<TelescopeTitle direction={direction} />}
      subtitle={direction === 'rear' ? originStar : target}
      className={className}
      tilt="left"
      help="telescope"
      footer={
        <>
          <MonitorButtons
            label="Direção do telescópio"
            options={DIRECTIONS}
            value={direction}
            onChange={setDirection}
            highlight={hint ? 'front' : null}
          />
          <MonitorButtons
            label="Sensor do telescópio"
            options={SENSORS}
            value={sensorMode}
            onChange={setSensorMode}
            highlight={hint === 'ir' ? SensorMode.Infrared : null}
          />
        </>
      }
    >
      {/* Como o para-brisa: o shader roda por pixel, e o monitor menor não precisa de mais resolução. */}
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 0], rotation: [0, Math.PI, 0], fov: WINDSHIELD_FOV_DEG / 13, near: 0.1, far: 100 }}
      >
        <Aim direction={direction} />
        <RelativisticSky sensorMode={sensorMode} autoExposure={direction === 'front'} readout={readout} />
        <TelescopeLabelTracker direction={direction} sensorMode={sensorMode} readout={readout} nodes={labelNodes} originVisible={!hint} />
      </Canvas>
      <TelescopeLabelLayer nodes={labelNodes} />
      {hint && (
        <p className="pointer-events-none absolute inset-x-2 bottom-2 rounded-sm bg-black/70 px-2 py-1 text-center text-[10px] leading-snug text-amber-100">
          {hint === 'ir'
            ? `${starSubject} já não aparece neste sensor: o desvio para o vermelho baixou demais a temperatura aparente. Tente o IV, ou vire para a FRENTE.`
            : `${starSubject} não aparece em nenhum sensor. Vire para a FRENTE: o céu inteiro está concentrado à frente.`}
        </p>
      )}
    </CockpitMonitor>
  );
}

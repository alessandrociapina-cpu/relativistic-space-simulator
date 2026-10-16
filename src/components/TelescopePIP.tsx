import { useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { WINDSHIELD_FOV_DEG, recommendedRearZoom } from '../physics/EyeAndPhotometry';
import { computeBodyAngularRadii } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';
import { useCockpitUi, type TelescopeDirection } from '../ui/cockpitUi';
import { formatSpaceNumber } from '../ui/format';
import { CockpitMonitor, MonitorButtons } from './CockpitMonitor';
import { RelativisticSky, SensorMode } from './RelativisticSky';

const SENSORS = [
  { value: SensorMode.Visible, label: 'VIS', title: 'Visível (380–750 nm)' },
  { value: SensorMode.Infrared, label: 'IV', title: 'Infravermelho' },
  { value: SensorMode.Ultraviolet, label: 'UV', title: 'Ultravioleta' },
  { value: SensorMode.XRay, label: 'RX', title: 'Raios X' },
] as const;

const DIRECTIONS = [
  { value: 'rear', label: 'TRÁS', title: 'Telescópio voltado para o Sol, atrás da nave' },
  { value: 'front', label: 'FRENTE', title: 'Telescópio voltado para o alvo, à frente' },
] as const;

/** Zoom do instante: à frente acompanha o cone e o alvo; atrás, enquadra o Sol. */
function telescopeZoom(direction: TelescopeDirection): number {
  const { flight, destination, photometry } = useFlightStore.getState();
  if (direction === 'front') return photometry.recommendedTelescopeZoom;
  return recommendedRearZoom(flight.eta, computeBodyAngularRadii(flight, destination).sunRadiusRad);
}

/** Aponta a câmera e aplica o auto-zoom antes do céu ler o FOV no mesmo frame. */
function Aim({ direction }: { direction: TelescopeDirection }) {
  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera;
    const yaw = direction === 'rear' ? Math.PI : 0;
    if (cam.rotation.y !== yaw) cam.rotation.set(0, yaw, 0);
    const fov = WINDSHIELD_FOV_DEG / telescopeZoom(direction);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function TelescopeTitle({ direction }: { direction: TelescopeDirection }) {
  const zoom = useFlightStore(() => Math.round(telescopeZoom(direction)));
  return (
    <>
      Telescópio · {direction === 'rear' ? 'trás' : 'frente'} · <span className="normal-case">x</span>{' '}
      {formatSpaceNumber(zoom)}
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

  return (
    <CockpitMonitor
      title={<TelescopeTitle direction={direction} />}
      subtitle={direction === 'rear' ? 'Sol' : target}
      className={className}
      tilt="left"
      footer={
        <>
          <MonitorButtons label="Direção do telescópio" options={DIRECTIONS} value={direction} onChange={setDirection} />
          <MonitorButtons label="Sensor do telescópio" options={SENSORS} value={sensorMode} onChange={setSensorMode} />
        </>
      }
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false }}
        camera={{ position: [0, 0, 0], rotation: [0, Math.PI, 0], fov: WINDSHIELD_FOV_DEG / 13, near: 0.1, far: 100 }}
      >
        <Aim direction={direction} />
        <RelativisticSky sensorMode={sensorMode} autoExposure={direction === 'front'} />
      </Canvas>
    </CockpitMonitor>
  );
}

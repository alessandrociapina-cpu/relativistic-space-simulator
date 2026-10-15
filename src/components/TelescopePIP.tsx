import { useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { WINDSHIELD_FOV_DEG } from '../physics/EyeAndPhotometry';
import { useFlightStore } from '../store/useFlightStore';
import { formatSpaceNumber } from '../ui/format';
import { CockpitMonitor, MonitorButtons } from './CockpitMonitor';
import { RelativisticSky, SensorMode } from './RelativisticSky';

const SENSORS = [
  { value: SensorMode.Visible, label: 'VIS', title: 'Visível (380–750 nm)' },
  { value: SensorMode.Infrared, label: 'IV', title: 'Infravermelho' },
  { value: SensorMode.Ultraviolet, label: 'UV', title: 'Ultravioleta' },
  { value: SensorMode.XRay, label: 'RX', title: 'Raios-X' },
] as const;

/** Aplica o auto-zoom à câmera antes do céu ler o FOV no mesmo frame. */
function AutoZoom() {
  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera;
    const fov = WINDSHIELD_FOV_DEG / useFlightStore.getState().photometry.recommendedTelescopeZoom;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function TelescopeTitle() {
  const zoom = useFlightStore((s) => Math.round(s.photometry.recommendedTelescopeZoom));
  return (
    <>
      TELESCOPE · <span className="normal-case">x</span> {formatSpaceNumber(zoom)}
    </>
  );
}

/** Monitor esquerdo: telescópio multiespectral na direção de voo, com auto-zoom. */
export function TelescopePIP({ className = '' }: { className?: string }) {
  const [sensorMode, setSensorMode] = useState<SensorMode>(SensorMode.Visible);
  const active = SENSORS.find((s) => s.value === sensorMode);

  return (
    <CockpitMonitor
      title={<TelescopeTitle />}
      subtitle={active?.title}
      className={className}
      footer={
        <MonitorButtons label="Sensor do telescópio" options={SENSORS} value={sensorMode} onChange={setSensorMode} />
      }
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false }}
        camera={{ position: [0, 0, 0], rotation: [0, 0, 0], fov: WINDSHIELD_FOV_DEG / 13, near: 0.1, far: 100 }}
      >
        <AutoZoom />
        <RelativisticSky sensorMode={sensorMode} autoExposure />
      </Canvas>
    </CockpitMonitor>
  );
}

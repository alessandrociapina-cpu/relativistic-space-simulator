import { Canvas } from '@react-three/fiber';
import { CockpitMonitor } from './CockpitMonitor';
import { RelativisticSky } from './RelativisticSky';

const REAR_FOV_DEG = 40;

/**
 * Câmera traseira fixa, apontada para o Sol (+Z). Com a aceleração, a
 * aberração amplia o Sol por e^η enquanto o Doppler o desloca para o
 * infravermelho até sumir do visível.
 */
export function RearCameraPIP({ className = '' }: { className?: string }) {
  return (
    <CockpitMonitor title="Câmera traseira" subtitle={`Sol · ${REAR_FOV_DEG}°`} className={className}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false }}
        camera={{ position: [0, 0, 0], rotation: [0, Math.PI, 0], fov: REAR_FOV_DEG, near: 0.1, far: 100 }}
      >
        <RelativisticSky />
      </Canvas>
    </CockpitMonitor>
  );
}

import { Canvas } from '@react-three/fiber';
import { WINDSHIELD_FOV_DEG } from '../physics/EyeAndPhotometry';
import { RelativisticSky } from './RelativisticSky';

/** Ampliação da câmera traseira em relação ao para-brisa ("REAR VIEW · x 12"). */
export const REAR_VIEW_ZOOM = 12;

/**
 * Câmera traseira fixa, apontada para o Sol (+Z). Com a aceleração, a
 * aberração amplia o Sol por e^η enquanto o Doppler o desloca para o
 * infravermelho até sumir do visível.
 */
export function RearCameraView() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: false }}
      camera={{
        position: [0, 0, 0],
        rotation: [0, Math.PI, 0],
        fov: WINDSHIELD_FOV_DEG / REAR_VIEW_ZOOM,
        near: 0.1,
        far: 100,
      }}
    >
      <RelativisticSky />
    </Canvas>
  );
}

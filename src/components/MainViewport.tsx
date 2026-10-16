import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WINDSHIELD_FOV_DEG } from '../physics/EyeAndPhotometry';
import { useFlightStore } from '../store/useFlightStore';
import { RelativisticSky } from './RelativisticSky';

/**
 * Para-brisa principal (visível). A câmera orbita a origem a uma distância
 * mínima, o que na prática só gira a direção de observação: arrastar olha ao
 * redor do cockpit. A visão inicial é para a frente (−Z, rumo ao alvo). Com um
 * piloto a bordo, a imagem passa pelo olho dele (ofuscamento e adaptação); na
 * sonda robótica, é a câmera de bordo.
 */
export function MainViewport({ className = '' }: { className?: string }) {
  const crewed = useFlightStore((s) => s.crew === 'crewed');
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 1e-3], fov: WINDSHIELD_FOV_DEG, near: 0.1, far: 100 }}
      >
        <RelativisticSky pilotEye={crewed} />
        <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={-0.4} enableDamping dampingFactor={0.1} />
      </Canvas>
    </div>
  );
}

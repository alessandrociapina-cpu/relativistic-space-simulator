import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RelativisticSky } from './RelativisticSky';

/**
 * Para-brisa principal (visível). A câmera orbita a origem a uma distância
 * mínima, o que na prática só gira a direção de observação: arrastar olha ao
 * redor do cockpit. A visão inicial é para a frente (−Z, rumo ao alvo).
 */
export function MainViewport({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 1e-3], fov: 70, near: 0.1, far: 100 }}
      >
        <RelativisticSky />
        <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={-0.4} enableDamping dampingFactor={0.1} />
      </Canvas>
    </div>
  );
}

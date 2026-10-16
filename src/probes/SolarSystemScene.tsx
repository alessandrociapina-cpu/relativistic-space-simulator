import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
  Vector3,
  type Group,
  type Mesh,
  type PerspectiveCamera,
  type Sprite,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { MISSION_LIST, type ProbeMission } from './missions';
import { PLANET_LIST, orbitPolyline, planetPosition } from './planets';
import { probePosition } from './probes';
import { bodyRadiusAu, focusPosition, isPlanet, localScale, toDisplay, viewDistance } from './sceneMath';
import { isoToDays } from './time';
import { useProbeStore, type FocusId } from './useProbeStore';
import type { Vec3 } from './vec3';

/** Tamanho mínimo na tela: planetas e sondas nunca somem, mesmo a 100 UA. */
const MIN_BODY_PX = 3;
const MIN_PROBE_PX = 4;
const SUN_GLOW_PX = 26;
const STAR_SPHERE = 20_000;

/** Linha simples (o JSX `<line>` colide com o do SVG; aqui é o objeto do three). */
function makeLine(color: string, opacity: number): Line {
  const material = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  return new Line(new BufferGeometry(), material);
}

function setLinePoints(line: Line, points: readonly Vec3[]) {
  line.geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => [p[0], p[1], p[2]]), 3));
  line.geometry.computeBoundingSphere();
}

/** Segmento de dois pontos, reaproveitando o buffer (atualizado a cada frame). */
function setSegment(line: Line, a: Vec3, b: Vec3) {
  let attr = line.geometry.getAttribute('position') as Float32BufferAttribute | undefined;
  if (!attr || attr.count !== 2) {
    attr = new Float32BufferAttribute(new Float32Array(6), 3);
    line.geometry.setAttribute('position', attr);
  }
  attr.setXYZ(0, a[0], a[1], a[2]);
  attr.setXYZ(1, b[0], b[1], b[2]);
  attr.needsUpdate = true;
  line.frustumCulled = false;
}

/** Brilho radial do Sol (textura gerada uma vez). */
function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.25, 'rgba(255,200,110,0.55)');
  g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** Instantes da trilha: grade regular, mais densa até 1990, e os pontos dos encontros subdivididos. */
function trailTimes(mission: ProbeMission): number[] {
  const { launch, end, encounters } = mission.trajectory;
  const dense = isoToDays('1990-01-01');
  const times: number[] = [];
  for (let t = launch; t < end; t += t < dense ? 4 : 30) times.push(t);
  for (const e of encounters) {
    const ts = e.table.t;
    for (let i = 0; i < ts.length - 1; i++) for (let k = 0; k < 4; k++) times.push(ts[i]! + ((ts[i + 1]! - ts[i]!) * k) / 4);
  }
  times.push(end);
  return [...new Set(times)].sort((a, b) => a - b);
}

/** Índice da última amostra com tempo ≤ t. */
function lastIndexAtOrBefore(times: readonly number[], t: number): number {
  let lo = -1;
  let hi = times.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

function Label({ id, name, color }: { id: FocusId; name: string; color: string }) {
  const setFocus = useProbeStore((s) => s.setFocus);
  const focused = useProbeStore((s) => s.focus === id);
  return (
    <Html zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
      <button
        type="button"
        onClick={() => setFocus(id)}
        className={`pointer-events-auto ml-2 -translate-y-1/2 font-mono text-[10px] whitespace-nowrap select-none hover:text-white ${
          focused ? 'font-bold text-white' : ''
        }`}
        style={focused ? undefined : { color }}
      >
        {name}
      </button>
    </Html>
  );
}

/** Rótulo da sonda só depois do lançamento (o HTML não some com `visible = false`). */
function ProbeLabel({ mission }: { mission: ProbeMission }) {
  const launched = useProbeStore((s) => s.t >= mission.trajectory.launch);
  return launched ? <Label id={mission.id} name={mission.name} color={mission.color} /> : null;
}

/**
 * Direção da câmera ao focar um planeta: do lado iluminado pelo Sol, um pouco
 * acima da eclíptica e de lado, para o planeta e o sobrevoo aparecerem de dia.
 */
function sunlitDirection(helio: Vec3): Vector3 {
  const toSun = new Vector3(-helio[0], -helio[1], -helio[2]).normalize();
  const side = new Vector3(0, 0, 1).cross(toSun).normalize();
  return toSun.multiplyScalar(0.8).add(side.multiplyScalar(0.45)).add(new Vector3(0, 0, 0.5)).normalize();
}

function SceneContent() {
  const scale = useProbeStore((s) => s.scale);
  // As órbitas mudam devagar (precessão): basta recalcular a cada ano.
  const orbitYear = useProbeStore((s) => Math.floor(s.t / 365.25));
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);

  const sun = useRef<Group>(null);
  const sunGlow = useRef<Sprite>(null);
  const planetGroups = useRef<(Group | null)[]>([]);
  const planetMeshes = useRef<(Mesh | null)[]>([]);
  const probeGroups = useRef<(Group | null)[]>([]);
  const probeMeshes = useRef<(Mesh | null)[]>([]);
  const lines = useRef<Group>(null);
  const stars = useRef<Group>(null);
  const glow = useMemo(glowTexture, []);

  const orbits = useMemo(() => PLANET_LIST.map((p) => makeLine(p.color, 0.35)), []);
  useEffect(() => {
    const t = orbitYear * 365.25;
    PLANET_LIST.forEach((p, i) => setLinePoints(orbits[i]!, orbitPolyline(p, t).map((q) => toDisplay(q, scale))));
  }, [orbits, orbitYear, scale]);

  const trails = useMemo(
    () =>
      MISSION_LIST.map((m) => ({
        times: trailTimes(m),
        line: makeLine(m.color, 0.85),
        tip: makeLine(m.color, 0.85),
        // A rota inteira, apagada: dá para ver para onde a sonda vai.
        future: makeLine(m.color, 0.16),
      })),
    [],
  );
  useEffect(() => {
    trails.forEach((trail, i) => {
      const trajectory = MISSION_LIST[i]!.trajectory;
      const points = trail.times.map((t) => toDisplay(probePosition(trajectory, t)!, scale));
      setLinePoints(trail.line, points);
      setLinePoints(trail.future, points);
    });
  }, [trails, scale]);

  const starPoints = useMemo(() => {
    const n = 2500;
    const positions: number[] = [];
    // Direções uniformes na esfera, pseudoaleatórias e fixas.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const z = 2 * rand() - 1;
      const phi = 2 * Math.PI * rand();
      const r = Math.sqrt(1 - z * z);
      positions.push(STAR_SPHERE * r * Math.cos(phi), STAR_SPHERE * r * Math.sin(phi), STAR_SPHERE * z);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return new Points(geometry, new PointsMaterial({ color: '#9aa6c8', size: 1.3, sizeAttenuation: false }));
  }, []);

  // Pedidos de câmera (troca de foco, de escala ou ida a um evento).
  const view = useProbeStore((s) => s.view);
  useEffect(() => {
    const { focus, t, scale: mode } = useProbeStore.getState();
    const distance = view.distance ?? viewDistance(focus, t, mode);
    if (isPlanet(focus)) camera.position.copy(sunlitDirection(planetPosition(focus, t)));
    else if (camera.position.lengthSq() === 0) camera.position.set(0, -1, 0.55);
    camera.position.setLength(distance);
    controls.current?.update();
  }, [view, camera]);

  useFrame(({ size }) => {
    const { t, focus, scale: mode } = useProbeStore.getState();
    const cam = camera as PerspectiveCamera;
    const origin = toDisplay(focusPosition(focus, t), mode);
    const worldPerPixel = (2 * Math.tan((cam.fov * Math.PI) / 360)) / size.height;
    const place = (obj: Group, p: Vec3) => obj.position.set(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    const minRadius = (obj: Group, px: number) => obj.position.distanceTo(cam.position) * worldPerPixel * px;

    if (sun.current) {
      place(sun.current, [0, 0, 0]);
      const mesh = sun.current.children[0] as Mesh;
      mesh.scale.setScalar(Math.max(bodyRadiusAu('sun') * localScale([0, 0, 0], mode), minRadius(sun.current, MIN_BODY_PX)));
      sunGlow.current?.scale.setScalar(minRadius(sun.current, SUN_GLOW_PX));
    }
    PLANET_LIST.forEach((planet, i) => {
      const group = planetGroups.current[i];
      const mesh = planetMeshes.current[i];
      if (!group || !mesh) return;
      const helio = planetPosition(planet.id, t);
      place(group, toDisplay(helio, mode));
      mesh.scale.setScalar(Math.max(bodyRadiusAu(planet.id) * localScale(helio, mode), minRadius(group, MIN_BODY_PX)));
    });
    MISSION_LIST.forEach((mission, i) => {
      const group = probeGroups.current[i];
      const mesh = probeMeshes.current[i];
      const trail = trails[i]!;
      const helio = probePosition(mission.trajectory, t);
      if (!group || !mesh) return;
      group.visible = helio !== null;
      trail.line.visible = trail.tip.visible = helio !== null;
      if (!helio) return;
      const p = toDisplay(helio, mode);
      place(group, p);
      mesh.scale.setScalar(minRadius(group, MIN_PROBE_PX));
      const last = lastIndexAtOrBefore(trail.times, t);
      trail.line.geometry.setDrawRange(0, last + 1);
      const from = toDisplay(probePosition(mission.trajectory, trail.times[Math.max(last, 0)]!)!, mode);
      setSegment(trail.tip, from, p);
    });
    lines.current?.position.set(-origin[0], -origin[1], -origin[2]);
    stars.current?.position.copy(cam.position);

    // Planos de recorte proporcionais à distância (com depth buffer logarítmico).
    const d = cam.position.length();
    const near = Math.max(d * 1e-4, 1e-9);
    if (Math.abs(cam.near - near) > near * 0.1) {
      cam.near = near;
      cam.far = Math.max(d * 1e4, STAR_SPHERE * 2);
      cam.updateProjectionMatrix();
    }
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <group ref={sun}>
        <mesh>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color="#ffd27a" />
        </mesh>
        <sprite ref={sunGlow}>
          <spriteMaterial map={glow} blending={AdditiveBlending} depthWrite={false} transparent />
        </sprite>
        <pointLight intensity={2.6} decay={0} />
        <Label id="sun" name="Sol" color="#fde68a" />
      </group>
      {PLANET_LIST.map((planet, i) => (
        <group key={planet.id} ref={(g) => void (planetGroups.current[i] = g)}>
          <mesh ref={(m) => void (planetMeshes.current[i] = m)}>
            <sphereGeometry args={[1, 32, 16]} />
            <meshStandardMaterial color={planet.color} roughness={0.85} />
          </mesh>
          <Label id={planet.id} name={planet.name} color={planet.color} />
        </group>
      ))}
      {MISSION_LIST.map((mission, i) => (
        <group key={mission.id} ref={(g) => void (probeGroups.current[i] = g)}>
          <mesh ref={(m) => void (probeMeshes.current[i] = m)}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color={mission.color} />
          </mesh>
          <ProbeLabel mission={mission} />
        </group>
      ))}
      <group ref={lines}>
        {orbits.map((line, i) => (
          <primitive key={PLANET_LIST[i]!.id} object={line} />
        ))}
        {trails.map((trail, i) => (
          <group key={MISSION_LIST[i]!.id}>
            <primitive object={trail.future} />
            <primitive object={trail.line} />
            <primitive object={trail.tip} />
          </group>
        ))}
      </group>
      <group ref={stars}>
        <primitive object={starPoints} />
      </group>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={1.15}
        minDistance={1e-7}
        maxDistance={600}
      />
    </>
  );
}

/** Cena 3D do Sistema Solar com eclíptica no plano XY e norte da eclíptica para cima. */
export function SolarSystemScene({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        camera={{ fov: 50, position: [0, -38, 21], up: [0, 0, 1], near: 1e-3, far: 1e5 }}
      >
        <color attach="background" args={['#02030a']} />
        <SceneContent />
      </Canvas>
    </div>
  );
}


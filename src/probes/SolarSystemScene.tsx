import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  Vector3,
  type Group,
  type Mesh,
  type PerspectiveCamera,
  type Sprite,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  BODIES,
  MOON_LIST,
  SMALL_BODY_LIST,
  bodyPosition,
  bodyState,
  moonOffset,
  moonPeriodDays,
  type BodyId,
  type MoonId,
  type SmallBodyId,
} from './bodies';
import { muAu } from './ephemeris';
import { conicPolyline } from './kepler';
import { COMPANIONS, MISSION_LIST, type CraftId, type ProbeId } from './missions';
import { PLANET_LIST, SUN_GM, orbitPolyline, planetPosition } from './planets';
import type { ProbeTrajectory } from './probes';
import {
  bodyRadiusAu,
  craftPoint,
  localPeriodDays,
  trailPoints,
  focusDisplay,
  focusPosition,
  frameBody,
  framePosition,
  isBodyFocus,
  localScale,
  nearDisplay,
  pointDisplay,
  systemCenter,
  toDisplay,
  viewDistance,
  type FocusId,
  type ScaleMode,
  type TrailPoint,
} from './sceneMath';
import { useProbeStore } from './useProbeStore';
import { norm, sub, type Vec3 } from './vec3';

/** Tamanho mínimo na tela: planetas e sondas nunca somem, mesmo a 100 UA. */
const MIN_BODY_PX = 3;
const MIN_MOON_PX = 2;
const MIN_PROBE_PX = 4;
const SUN_GLOW_PX = 26;
/** Uma lua só aparece quando se afasta do planeta pelo menos isto na tela. */
const MOON_MIN_SEPARATION_PX = 10;
const STAR_SPHERE = 20_000;
/** Em escala real, as órbitas dos planetas e dos corpos pequenos somem com a câmera mais perto que isto (UA). */
const ORBIT_LINES_MIN_AU = 0.005;
/** Pontos da volta recente desenhada a cada frame. */
const RECENT_POINTS = 96;

/** Linha simples (o JSX `<line>` colide com o do SVG; aqui é o objeto do three). */
function makeLine(color: string, opacity: number): Line {
  const material = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  return new Line(new BufferGeometry(), material);
}

/** Segmentos soltos (pares de pontos): o rastro pode ter lacunas. */
function makeSegments(color: string, opacity: number): LineSegments {
  const material = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  return new LineSegments(new BufferGeometry(), material);
}

/** Pontos do rastro como pares (k − 1, k), pulando as lacunas; `ends[k]` conta os segmentos que terminam até k. */
function setTrailSegments(line: LineSegments, points: readonly Vec3[], gaps: readonly boolean[]): number[] {
  const flat: number[] = [];
  const ends: number[] = [0];
  for (let k = 1; k < points.length; k++) {
    if (!gaps[k]) {
      const a = points[k - 1]!;
      const b = points[k]!;
      flat.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    ends.push(flat.length / 6);
  }
  line.geometry.setAttribute('position', new Float32BufferAttribute(flat, 3));
  line.geometry.computeBoundingSphere();
  return ends;
}

/** Polilinha de até `max` pontos, reaproveitando o buffer (atualizada a cada frame). */
function setPolyline(line: Line, points: readonly Vec3[], max: number) {
  let attr = line.geometry.getAttribute('position') as Float32BufferAttribute | undefined;
  if (!attr || attr.count !== max) {
    attr = new Float32BufferAttribute(new Float32Array(max * 3), 3);
    line.geometry.setAttribute('position', attr);
  }
  points.forEach((p, i) => attr.setXYZ(i, p[0], p[1], p[2]));
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, points.length);
  line.frustumCulled = false;
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
  line.geometry.setDrawRange(0, 2);
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

/**
 * No referencial de um corpo, o rastro mostra só o trecho dos encontros com
 * ele (do primeiro ao último): fora disso a rota vira uma curva enorme e sem
 * sentido em torno de um corpo que nem estava por perto.
 */
function windowRange(trajectory: ProbeTrajectory, times: readonly number[], frame: BodyId): [number, number] | null {
  const windows = trajectory.encounters.filter((e) => e.body === frame || systemCenter(e.body) === frame);
  if (windows.length === 0) return null;
  const start = Math.min(...windows.map((e) => e.start));
  const end = Math.max(...windows.map((e) => e.end));
  const first = times.findIndex((t) => t >= start);
  const last = lastIndexAtOrBefore(times, end);
  return first >= 0 && last > first ? [first, last] : null;
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

/** Rótulo clicável; a cena esconde ou mostra o elemento a cada frame. */
const Label = forwardRef<HTMLButtonElement, { id: FocusId; name: string; color: string }>(function Label({ id, name, color }, ref) {
  const setFocus = useProbeStore((s) => s.setFocus);
  const focused = useProbeStore((s) => s.focus === id);
  return (
    <Html zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
      <button
        ref={ref}
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
});

/**
 * Direção da câmera ao focar um corpo: do lado iluminado pelo Sol, um pouco
 * acima da eclíptica e de lado, para o corpo e o sobrevoo aparecerem de dia.
 */
function sunlitDirection(helio: Vec3): Vector3 {
  const toSun = new Vector3(-helio[0], -helio[1], -helio[2]).normalize();
  const side = new Vector3(0, 0, 1).cross(toSun).normalize();
  return toSun.multiplyScalar(0.8).add(side.multiplyScalar(0.45)).add(new Vector3(0, 0, 0.5)).normalize();
}

interface CraftView {
  readonly id: CraftId;
  readonly name: string;
  readonly color: string;
  readonly trajectory: ProbeTrajectory;
  /** A missão do seletor a que pertence (a própria, ou a nave-mãe). */
  readonly mission: ProbeId;
}

const CRAFTS: readonly CraftView[] = [
  ...MISSION_LIST.map((m) => ({ id: m.id, name: m.name, color: m.color, trajectory: m.trajectory, mission: m.id })),
  ...COMPANIONS.map((c) => ({ id: c.id, name: c.name, color: c.color, trajectory: c.trajectory, mission: c.parent })),
];

const setDisplay = (el: HTMLElement | null, visible: boolean) => {
  if (el) el.style.display = visible ? '' : 'none';
};

function SceneContent() {
  const scale = useProbeStore((s) => s.scale);
  const selected = useProbeStore((s) => s.selected);
  // As órbitas mudam devagar (precessão): basta recalcular a cada ano.
  const orbitYear = useProbeStore((s) => Math.floor(s.t / 365.25));
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);

  const sun = useRef<Group>(null);
  const sunGlow = useRef<Sprite>(null);
  const planetGroups = useRef<(Group | null)[]>([]);
  const planetMeshes = useRef<(Mesh | null)[]>([]);
  const moonGroups = useRef<(Group | null)[]>([]);
  const moonMeshes = useRef<(Mesh | null)[]>([]);
  const moonLabels = useRef<(HTMLButtonElement | null)[]>([]);
  const smallGroups = useRef<(Group | null)[]>([]);
  const smallMeshes = useRef<(Mesh | null)[]>([]);
  const smallLabels = useRef<(HTMLButtonElement | null)[]>([]);
  const craftGroups = useRef<(Group | null)[]>([]);
  const craftMeshes = useRef<(Mesh | null)[]>([]);
  const craftLabels = useRef<(HTMLButtonElement | null)[]>([]);
  const lines = useRef<Group>(null);
  const stars = useRef<Group>(null);
  const glow = useMemo(glowTexture, []);

  const orbits = useMemo(() => PLANET_LIST.map((p) => makeLine(p.color, 0.35)), []);
  const smallOrbits = useMemo(() => SMALL_BODY_LIST.map((b) => makeLine(b.color, 0.22)), []);
  useEffect(() => {
    const t = orbitYear * 365.25;
    PLANET_LIST.forEach((p, i) => setLinePoints(orbits[i]!, orbitPolyline(p, t).map((q) => toDisplay(q, scale))));
    SMALL_BODY_LIST.forEach((b, i) => {
      const state = bodyState(b.id, t) ?? bodyState(b.id, useProbeStore.getState().t);
      const polyline = state ? conicPolyline({ r: state.position, v: state.velocity }, muAu(SUN_GM)) : null;
      setLinePoints(smallOrbits[i]!, (polyline ?? []).map((q) => toDisplay(q, scale)));
    });
  }, [orbits, smallOrbits, orbitYear, scale]);

  // Órbitas das luas em torno do planeta (escala do sistema), refeitas quando a lua anda 1/40 da volta.
  const moonOrbits = useMemo(
    () => MOON_LIST.map((m) => ({ line: makeLine(m.color, 0.3), builtAt: NaN, builtScale: '' as ScaleMode | '' })),
    [],
  );

  // Os pontos dos rastros são calculados aos poucos, um por vez, depois da primeira imagem
  // (a missão escolhida primeiro): calcular todos de uma vez travaria a abertura por segundos.
  const trails = useMemo(
    () =>
      CRAFTS.map((c) => {
        return {
          times: [] as number[],
          points: [] as TrailPoint[],
          gaps: [] as boolean[],
          /** Referencial e escala em que `local` foi montado (null: refazer). */
          builtFor: null as { body: BodyId | null; mode: ScaleMode } | null,
          /** Pontos como estão na linha (no referencial do corpo em foco, se houver). */
          local: [] as Vec3[],
          /** Segmentos que terminam até cada ponto (para o trecho desenhado). */
          ends: [] as number[],
          /** Trecho desenhado no referencial de um corpo: as janelas de encontro com ele (null = nenhum). */
          range: null as [number, number] | null,
          line: makeSegments(c.color, 0.85),
          tip: makeLine(c.color, 0.85),
          // A rota inteira, apagada: dá para ver para onde a sonda vai.
          future: makeSegments(c.color, 0.16),
        };
      }),
    [],
  );
  const trailGroup = useRef<Group>(null);
  useEffect(() => {
    const first = useProbeStore.getState().selected;
    const order = CRAFTS.map((c, i) => ({ c, i })).sort((a, b) => Number(b.c.mission === first) - Number(a.c.mission === first));
    let cancelled = false;
    let next = 0;
    const work = () => {
      if (cancelled || next >= order.length) return;
      const { c, i } = order[next++]!;
      Object.assign(trails[i]!, trailPoints(c.trajectory), { builtFor: null });
      setTimeout(work, 0);
    };
    const id = setTimeout(work, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [trails]);
  // A sonda escolhida (e as companheiras dela) em destaque; as demais, só o rastro, mais apagado.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
    trails.forEach((trail, i) => {
      const mine = CRAFTS[i]!.mission === selected;
      (trail.line.material as LineBasicMaterial).opacity = mine ? 0.9 : 0.4;
      (trail.tip.material as LineBasicMaterial).opacity = mine ? 0.9 : 0.4;
    });
  }, [trails, selected]);

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
    const distance = view.distance !== null ? view.distance * localScale(focusPosition(focus, t), mode) : viewDistance(focus, t, mode);
    if (isBodyFocus(focus)) camera.position.copy(sunlitDirection(focusPosition(focus, t)));
    else if (camera.position.lengthSq() === 0) camera.position.set(0, -1, 0.55);
    camera.position.setLength(distance);
    controls.current?.update();
  }, [view, camera]);

  useFrame(({ size }) => {
    const { t, focus, scale: mode } = useProbeStore.getState();
    const cam = camera as PerspectiveCamera;
    const origin = focusDisplay(focus, t, mode);
    const worldPerPixel = (2 * Math.tan((cam.fov * Math.PI) / 360)) / size.height;
    const place = (obj: Group, p: Vec3) => obj.position.set(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    const minRadius = (obj: Group, px: number) => obj.position.distanceTo(cam.position) * worldPerPixel * px;

    if (sun.current) {
      place(sun.current, [0, 0, 0]);
      const mesh = sun.current.children[0] as Mesh;
      mesh.scale.setScalar(Math.max(bodyRadiusAu('sun') * localScale([0, 0, 0], mode), minRadius(sun.current, MIN_BODY_PX)));
      sunGlow.current?.scale.setScalar(minRadius(sun.current, SUN_GLOW_PX));
    }

    const planetHelio = new Map<string, Vec3>();
    PLANET_LIST.forEach((planet, i) => {
      const group = planetGroups.current[i];
      const mesh = planetMeshes.current[i];
      const helio = planetPosition(planet.id, t);
      planetHelio.set(planet.id, helio);
      if (!group || !mesh) return;
      place(group, toDisplay(helio, mode));
      mesh.scale.setScalar(Math.max(bodyRadiusAu(planet.id) * localScale(helio, mode), minRadius(group, MIN_BODY_PX)));
    });

    MOON_LIST.forEach((moon, i) => {
      const group = moonGroups.current[i];
      const mesh = moonMeshes.current[i];
      const orbit = moonOrbits[i]!;
      if (!group || !mesh) return;
      const parent = planetHelio.get(moon.parent!)!;
      const s = localScale(parent, mode);
      const helio = bodyPosition(moon.id, t)!;
      place(group, nearDisplay(helio, parent, mode));
      const parentDisplay = toDisplay(parent, mode);
      const parentDistance = Math.hypot(parentDisplay[0] - origin[0] - cam.position.x, parentDisplay[1] - origin[1] - cam.position.y, parentDisplay[2] - origin[2] - cam.position.z);
      const separationPx = (norm(sub(helio, parent)) * s) / (parentDistance * worldPerPixel);
      const visible = separationPx > MOON_MIN_SEPARATION_PX || focus === moon.id;
      group.visible = visible;
      orbit.line.visible = visible;
      setDisplay(moonLabels.current[i] ?? null, visible);
      if (!visible) return;
      mesh.scale.setScalar(Math.max(bodyRadiusAu(moon.id) * s, minRadius(group, MIN_MOON_PX)));
      const period = moonPeriodDays(moon.id as MoonId);
      if (!(Math.abs(t - orbit.builtAt) < period / 40) || orbit.builtScale !== mode) {
        const points = Array.from({ length: 129 }, (_, k) => {
          const offset = moonOffset(moon.id as MoonId, t + ((k - 64) / 128) * period).position;
          return [offset[0] * s, offset[1] * s, offset[2] * s] as Vec3;
        });
        setLinePoints(orbit.line, points);
        orbit.builtAt = t;
        orbit.builtScale = mode;
      }
      orbit.line.position.set(parentDisplay[0] - origin[0], parentDisplay[1] - origin[1], parentDisplay[2] - origin[2]);
    });

    SMALL_BODY_LIST.forEach((body, i) => {
      const group = smallGroups.current[i];
      const mesh = smallMeshes.current[i];
      const helio = bodyPosition(body.id as SmallBodyId, t);
      const visible = helio !== null;
      smallOrbits[i]!.visible = visible;
      setDisplay(smallLabels.current[i] ?? null, visible);
      if (!group || !mesh) return;
      group.visible = visible;
      if (!helio) return;
      place(group, toDisplay(helio, mode));
      mesh.scale.setScalar(Math.max(bodyRadiusAu(body.id) * localScale(helio, mode), minRadius(group, MIN_BODY_PX)));
    });

    // Rastros no referencial do corpo em foco (em escala real): a órbita em torno de Júpiter ou do cometa
    // aparece como órbita, não como a espiral que ela desenha em torno do Sol.
    const frame = frameBody(focus, t, mode);
    trails.forEach((trail, i) => {
      if (trail.times.length === 0 || (trail.builtFor && trail.builtFor.body === frame && trail.builtFor.mode === mode)) return;
      trail.local = trail.points.map((point, k) => {
        const d = pointDisplay(point, mode);
        return frame ? sub(d, framePosition(frame, trail.times[k]!)) : d;
      });
      trail.range = frame ? windowRange(CRAFTS[i]!.trajectory, trail.times, frame) : [0, trail.times.length - 1];
      trail.ends = setTrailSegments(trail.line, trail.local, trail.gaps);
      setTrailSegments(trail.future, trail.local, trail.gaps);
      if (trail.range) {
        const first = trail.ends[trail.range[0]]!;
        trail.future.geometry.setDrawRange(2 * first, 2 * (trail.ends[trail.range[1]]! - first));
      }
      trail.builtFor = { body: frame, mode };
    });
    const frameNow: Vec3 = frame ? framePosition(frame, t) : [0, 0, 0];
    trailGroup.current?.position.set(frameNow[0] - origin[0], frameNow[1] - origin[1], frameNow[2] - origin[2]);

    CRAFTS.forEach((c, i) => {
      const group = craftGroups.current[i];
      const mesh = craftMeshes.current[i];
      const trail = trails[i]!;
      const point = craftPoint(c.trajectory, t);
      const visible = point !== null;
      setDisplay(craftLabels.current[i] ?? null, visible);
      const range = trail.range;
      const last = lastIndexAtOrBefore(trail.times, t);
      const first = range ? trail.ends[range[0]]! : 0;
      const drawn = range && last >= range[0] ? trail.ends[Math.min(last, range[1])]! - first : 0;
      trail.line.visible = visible && drawn > 0;
      trail.tip.visible = visible && range !== null && last >= range[0] && last < range[1];
      trail.future.visible = c.mission === selectedRef.current && range !== null;
      if (!group || !mesh) return;
      group.visible = visible;
      if (!point) return;
      const p = pointDisplay(point, mode);
      place(group, p);
      mesh.scale.setScalar(minRadius(group, MIN_PROBE_PX));
      if (range && drawn > 0) trail.line.geometry.setDrawRange(2 * first, 2 * drawn);
      if (!trail.tip.visible) return;
      if (trail.gaps[last + 1]) {
        // Numa lacuna do rastro (órbita rápida): desenha agora a última volta, ponto a ponto.
        const period = Math.min(localPeriodDays(c.trajectory, t) ?? 0, t - trail.times[last]!);
        const recent: Vec3[] = [];
        for (let k = 0; k < RECENT_POINTS; k++) {
          const tk = t - period + (period * k) / (RECENT_POINTS - 1);
          const q = craftPoint(c.trajectory, tk);
          if (q) recent.push(frame ? sub(pointDisplay(q, mode), framePosition(frame, tk)) : pointDisplay(q, mode));
        }
        setPolyline(trail.tip, recent, RECENT_POINTS);
      } else {
        setSegment(trail.tip, trail.local[Math.max(last, 0)]!, sub(p, frameNow));
      }
    });

    lines.current?.position.set(-origin[0], -origin[1], -origin[2]);
    // Bem perto de um corpo, as órbitas heliocêntricas viram só segmentos de polígono cruzando a tela.
    if (lines.current) lines.current.visible = mode === 'log' || cam.position.length() > ORBIT_LINES_MIN_AU;
    stars.current?.position.copy(cam.position);

    // Planos de recorte proporcionais à distância (com depth buffer logarítmico).
    const d = cam.position.length();
    const near = Math.max(d * 1e-4, 1e-11);
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
            <sphereGeometry args={[1, 64, 32]} />
            <meshStandardMaterial color={planet.color} roughness={0.85} />
          </mesh>
          <Label id={planet.id} name={planet.name} color={planet.color} />
        </group>
      ))}
      {MOON_LIST.map((moon, i) => (
        <group key={moon.id} ref={(g) => void (moonGroups.current[i] = g)}>
          <mesh ref={(m) => void (moonMeshes.current[i] = m)}>
            <sphereGeometry args={[1, 64, 32]} />
            <meshStandardMaterial color={moon.color} roughness={0.9} />
          </mesh>
          <Label ref={(el) => void (moonLabels.current[i] = el)} id={moon.id} name={moon.name} color={moon.color} />
        </group>
      ))}
      {SMALL_BODY_LIST.map((body, i) => (
        <group key={body.id} ref={(g) => void (smallGroups.current[i] = g)}>
          <mesh ref={(m) => void (smallMeshes.current[i] = m)}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color={body.color} roughness={1} flatShading />
          </mesh>
          <Label ref={(el) => void (smallLabels.current[i] = el)} id={body.id} name={BODIES[body.id].name} color={body.color} />
        </group>
      ))}
      {CRAFTS.map((c, i) => (
        <group key={c.id} ref={(g) => void (craftGroups.current[i] = g)}>
          <mesh ref={(m) => void (craftMeshes.current[i] = m)}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color={c.color} />
          </mesh>
          <Label ref={(el) => void (craftLabels.current[i] = el)} id={c.id} name={c.name} color={c.color} />
        </group>
      ))}
      {moonOrbits.map((orbit, i) => (
        <primitive key={MOON_LIST[i]!.id} object={orbit.line} />
      ))}
      <group ref={lines}>
        {orbits.map((line, i) => (
          <primitive key={PLANET_LIST[i]!.id} object={line} />
        ))}
        {smallOrbits.map((line, i) => (
          <primitive key={SMALL_BODY_LIST[i]!.id} object={line} />
        ))}
      </group>
      <group ref={trailGroup}>
        {trails.map((trail, i) => (
          <group key={CRAFTS[i]!.id}>
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
        minDistance={1e-9}
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


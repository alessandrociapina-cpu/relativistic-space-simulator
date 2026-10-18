import { useEffect, useRef, useState, type ReactNode } from 'react';
// Só as âncoras: a física e o catálogo da ficção ficam no pedaço do cockpit, carregado à parte.
import { APP_HASH, SCIFI_TAB_HASH } from '../ui/appMode';

const STAR_COUNT = 700;

/**
 * Campo de estrelas em perspectiva vindo na direção de quem olha. Com `warp`,
 * a velocidade sobe e as estrelas à frente azulam e se alongam, um aceno ao
 * Doppler e à aberração do simulador.
 */
function Starfield({ warp }: { warp: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const warpRef = useRef(warp);
  useEffect(() => {
    warpRef.current = warp;
  }, [warp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      m: Math.random() ** 3,
    }));
    let speed = 0.03;
    let frame = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(0, 2, 6, 0.55)';
      ctx.fillRect(0, 0, w, h);
      const target = reduced ? 0 : warpRef.current ? 0.55 : 0.035;
      speed += (target - speed) * Math.min(1, dt * 1.5);
      const scale = Math.max(w, h) * 0.6;
      const blue = Math.min(1, speed / 0.5);
      for (const s of stars) {
        const z0 = s.z;
        s.z -= speed * dt;
        if (s.z <= 0.02) {
          s.x = (Math.random() - 0.5) * 2;
          s.y = (Math.random() - 0.5) * 2;
          s.z = 1;
          continue;
        }
        const px = w / 2 + (s.x / s.z) * scale;
        const py = h / 2 + (s.y / s.z) * scale;
        if (px < -50 || px > w + 50 || py < -50 || py > h + 50) continue;
        const qx = w / 2 + (s.x / z0) * scale;
        const qy = h / 2 + (s.y / z0) * scale;
        const near = 1 - s.z;
        const alpha = Math.min(1, 0.15 + near * 1.2) * (0.35 + 0.65 * s.m);
        const r = Math.round(255 - 90 * blue * near);
        const g = Math.round(235 - 25 * blue * near);
        ctx.strokeStyle = `rgba(${r}, ${g}, 255, ${alpha})`;
        ctx.lineWidth = 0.6 + 1.8 * near * (0.4 + s.m);
        ctx.beginPath();
        ctx.moveTo(qx, qy);
        ctx.lineTo(px + 0.01, py);
        ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
}

function ShipIcon() {
  return (
    <svg viewBox="0 0 120 70" className="h-14 w-auto" aria-hidden>
      <path d="M 8 35 L 112 12 M 8 35 L 112 58" stroke="#22d3ee" strokeOpacity="0.35" strokeDasharray="3 4" />
      <ellipse cx="96" cy="35" rx="6" ry="23" fill="none" stroke="#22d3ee" strokeOpacity="0.5" />
      <path d="M 18 35 l 26 -7 l 18 7 l -18 7 z" fill="#0e7490" stroke="#67e8f9" strokeWidth="1.2" />
      <circle cx="108" cy="35" r="4.5" fill="#fbbf24" />
      <circle cx="108" cy="35" r="9" fill="#fbbf24" fillOpacity="0.15" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg viewBox="0 0 120 70" className="h-14 w-auto" aria-hidden>
      <ellipse cx="60" cy="35" rx="52" ry="22" fill="none" stroke="#22d3ee" strokeOpacity="0.35" />
      <ellipse cx="60" cy="35" rx="30" ry="12" fill="none" stroke="#22d3ee" strokeOpacity="0.5" />
      <path d="M 60 35 C 80 10, 104 18, 116 30" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="60" cy="35" r="5" fill="#fde047" />
      <circle cx="90" cy="35" r="2.5" fill="#60a5fa" />
      <rect x="112" y="27" width="6" height="6" fill="#e2e8f0" transform="rotate(20 115 30)" />
    </svg>
  );
}

interface ChoiceProps {
  href: string;
  icon: ReactNode;
  kicker: string;
  title: string;
  text: string;
  action: string;
  onHover?: (on: boolean) => void;
}

function Choice({ href, icon, kicker, title, text, action, onHover }: ChoiceProps) {
  return (
    <a
      href={href}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      className="hull-panel group flex flex-1 flex-col gap-3 rounded-xl p-5 text-left transition-transform duration-300 outline-none hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-cyan-300 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[10px] tracking-[0.3em] text-cyan-300/70 uppercase">{kicker}</div>
          <h2 className="font-display mt-1 text-lg font-bold tracking-wide text-slate-50 sm:text-xl">{title}</h2>
        </div>
        {icon}
      </div>
      <p className="text-sm leading-relaxed text-slate-300">{text}</p>
      <span className="font-display mt-auto inline-flex items-center gap-2 self-start rounded-md border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-xs tracking-[0.2em] text-cyan-200 uppercase transition-colors group-hover:bg-cyan-400/25">
        {action} <span aria-hidden>›</span>
      </span>
    </a>
  );
}

/** Tela de abertura: escolher entre a viagem relativística e as sondas históricas. */
export function SplashScreen() {
  const [warp, setWarp] = useState(false);
  return (
    <main className="relative h-full w-full overflow-y-auto bg-black text-slate-100">
      <Starfield warp={warp} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.75)_100%)]" />
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-8 px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8">
        <header className="text-center">
          <div className="font-display text-[11px] tracking-[0.5em] text-cyan-300/80 uppercase">Projeto Minda</div>
          <h1 className="font-display glow-text mt-3 text-3xl font-bold tracking-wider text-white sm:text-5xl">
            Simulador Relativístico
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
            Física de verdade, em tempo real, no navegador. Escolha a sua viagem.
          </p>
        </header>
        <div className="flex flex-col gap-4 md:flex-row">
          <Choice
            href={APP_HASH.relativistic}
            icon={<ShipIcon />}
            kicker="Viagem interestelar"
            title="Quase à velocidade da luz"
            text="Planeje uma missão até Alfa Centauri, Tau Ceti, Sirius, o centro da galáxia ou Andrômeda, com piloto humano ou sonda robótica, partindo da Terra ou de Erid. Veja da cabine a aberração da luz, o Doppler, a radiação cósmica de fundo e a dilatação do tempo."
            action="Planejar a missão"
            onHover={setWarp}
          />
          <Choice
            href={APP_HASH.probes}
            icon={<OrbitIcon />}
            kicker="Sistema Solar"
            title="Sondas históricas"
            text="Acompanhe as trajetórias reais de 17 sondas e das missões Apollo, de 1968 a 2035: Voyager, Pioneer, Cassini, New Horizons, os pousos na Lua e em Marte, com os dados do JPL."
            action="Abrir o Sistema Solar"
          />
        </div>
        <a
          href={SCIFI_TAB_HASH}
          onMouseEnter={() => setWarp(true)}
          onMouseLeave={() => setWarp(false)}
          onFocus={() => setWarp(true)}
          onBlur={() => setWarp(false)}
          className="group -mt-4 flex flex-col gap-2 rounded-xl border border-violet-300/60 bg-violet-950/40 px-5 py-4 text-left shadow-[0_0_24px_rgba(167,139,250,0.25)] backdrop-blur-sm transition-colors outline-none hover:bg-violet-900/45 focus-visible:ring-2 focus-visible:ring-violet-300 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6"
        >
          <div className="min-w-0">
            <div className="font-display flex items-center gap-2 text-[10px] tracking-[0.3em] text-violet-200/80 uppercase">
              <span aria-hidden>📚</span> Ficção científica hard
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">
              Avatar, Project Hail Mary (com a Blip-A de Rocky), Tau Zero, The Expanse, A Floresta Sombria e a Starshot:
              as viagens das obras com a física de verdade, em um clique.
            </p>
          </div>
          <span className="font-display inline-flex shrink-0 items-center gap-2 self-start rounded-md border border-violet-300/50 bg-violet-400/15 px-3 py-2 text-xs tracking-[0.2em] text-violet-100 uppercase transition-colors group-hover:bg-violet-400/30 sm:self-center">
            Ver as missões <span aria-hidden>›</span>
          </span>
        </a>
        <footer className="font-display text-center text-[10px] tracking-[0.25em] text-slate-500 uppercase">
          Cinemática em 64 bits · funciona offline
        </footer>
      </div>
    </main>
  );
}

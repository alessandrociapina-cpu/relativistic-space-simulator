import type { MouseEvent } from 'react';
import { APP_HASH, SCIFI_TAB_HASH, type AppMode } from '../ui/appMode';
import { useCockpitUi } from '../ui/cockpitUi';

type NavId = 'home' | 'relativistic' | 'scifi' | 'probes';

const ITEMS: readonly { id: NavId; href: string; icon: string; label: string; title: string }[] = [
  { id: 'home', href: APP_HASH.home, icon: '⌂', label: 'Início', title: 'Tela de abertura' },
  { id: 'relativistic', href: APP_HASH.relativistic, icon: '🚀', label: 'Viagem', title: 'Viagem relativística: planejamento e cockpit' },
  { id: 'scifi', href: SCIFI_TAB_HASH, icon: '📚', label: 'Ficção', title: 'Missões da ficção científica hard' },
  { id: 'probes', href: APP_HASH.probes, icon: '🛰', label: 'Sondas', title: 'Sondas históricas no Sistema Solar' },
];

const itemClass = (id: NavId, active: boolean) => {
  const base =
    'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[10px] tracking-[0.08em] uppercase transition-colors outline-none focus-visible:ring-2 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[12px] sm:tracking-[0.12em]';
  if (id === 'scifi') {
    return `${base} focus-visible:ring-violet-300 ${
      active ? 'bg-violet-500/30 text-violet-50 shadow-[inset_0_-2px_0_rgb(196_181_253)]' : 'text-violet-200/90 hover:bg-violet-500/15 hover:text-violet-50'
    }`;
  }
  return `${base} focus-visible:ring-cyan-300 ${
    active ? 'bg-cyan-400/20 text-cyan-50 shadow-[inset_0_-2px_0_rgb(103_232_249)]' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
  }`;
};

/**
 * Barra de navegação única, no topo de todas as telas: abertura, viagem relativística, missões da ficção
 * científica hard e sondas. Dentro da viagem, "Viagem" e "Ficção" trocam a aba do planejamento sem
 * recarregar o cockpit.
 */
export function AppNav({ mode }: { mode: AppMode }) {
  const plannerOpen = useCockpitUi((s) => s.plannerOpen);
  const plannerTab = useCockpitUi((s) => s.plannerTab);
  const active: NavId =
    mode === 'relativistic' ? (plannerOpen && plannerTab === 'scifi' ? 'scifi' : 'relativistic') : mode === 'probes' ? 'probes' : 'home';

  const onClick = (id: NavId) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (mode !== 'relativistic' || (id !== 'relativistic' && id !== 'scifi')) return;
    // Já no cockpit: só a aba do planejamento muda (a missão em voo continua).
    e.preventDefault();
    const ui = useCockpitUi.getState();
    if (id === 'scifi') {
      if (ui.plannerOpen) ui.setPlannerTab('scifi');
      else ui.openPlanner('scifi');
    } else if (ui.plannerOpen) ui.setPlannerTab('plan');
  };

  return (
    <nav
      aria-label="Seções do app"
      className="relative z-50 flex shrink-0 items-center gap-2 border-b border-cyan-400/20 bg-[#05090f]/95 px-2 pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-1 pl-[max(0.5rem,env(safe-area-inset-left))] backdrop-blur-md sm:px-4"
    >
      <a
        href={APP_HASH.home}
        className="font-display hidden shrink-0 text-[10px] tracking-[0.35em] text-cyan-300/80 uppercase hover:text-cyan-100 md:block"
      >
        Projeto Minda
      </a>
      <div className="grid flex-1 grid-cols-4 gap-1 md:ml-auto md:flex md:flex-none">
        {ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.href}
            title={item.title}
            aria-current={item.id === active ? 'page' : undefined}
            className={itemClass(item.id, item.id === active)}
            onClick={onClick(item.id)}
          >
            <span aria-hidden className="text-sm leading-none tracking-normal">
              {item.icon}
            </span>
            <span className="font-display truncate">{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

import type { ReactNode } from 'react';

interface CockpitMonitorProps {
  title: string;
  subtitle?: string;
  className?: string;
  /** Conteúdo abaixo da tela (botões, legendas). */
  footer?: ReactNode;
  children: ReactNode;
}

/** Moldura dos monitores secundários do cockpit (PIP). */
export function CockpitMonitor({ title, subtitle, className = '', footer, children }: CockpitMonitorProps) {
  return (
    <section
      className={`overflow-hidden rounded-md border border-cyan-400/30 bg-black/80 font-mono shadow-lg shadow-black/60 backdrop-blur-sm ${className}`}
    >
      <header className="flex items-baseline justify-between gap-2 px-2 py-1 text-[10px] tracking-widest text-cyan-300/80 uppercase">
        <span>{title}</span>
        {subtitle && <span className="truncate text-slate-500 normal-case">{subtitle}</span>}
      </header>
      <div className="relative aspect-[4/3] border-y border-cyan-400/20">{children}</div>
      {footer}
    </section>
  );
}

import type { ReactNode } from 'react';

interface CockpitMonitorProps {
  title: ReactNode;
  subtitle?: string | undefined;
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
        <span className="whitespace-nowrap">{title}</span>
        {subtitle && <span className="hidden truncate text-slate-500 normal-case sm:inline">{subtitle}</span>}
      </header>
      <div className="relative aspect-[4/3] border-y border-cyan-400/20">{children}</div>
      {footer}
    </section>
  );
}

const segmentClass = (active: boolean) =>
  `rounded-sm px-1 py-1 text-[11px] tracking-wider transition-colors ${
    active ? 'bg-cyan-400/80 text-black' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
  }`;

/** Fileira de botões exclusivos abaixo de um monitor. */
export function MonitorButtons<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="grid gap-1 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={segmentClass(o.value === value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

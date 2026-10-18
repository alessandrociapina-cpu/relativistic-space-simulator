import type { ReactNode } from 'react';
import type { IndicatorId } from '../ui/indicatorHelp';
import { InfoTip } from './InfoTip';

interface CockpitMonitorProps {
  title: ReactNode;
  subtitle?: string | undefined;
  className?: string;
  /** Inclinação da tela pendurada, em direção ao centro do cockpit. */
  tilt?: 'left' | 'right';
  /** Conteúdo abaixo da tela (teclas, legendas). */
  footer?: ReactNode;
  /** O ⚠ que explica a tela. */
  help?: IndicatorId;
  children: ReactNode;
}

const TILT = {
  left: 'lg:[transform:perspective(1100px)_rotateY(9deg)]',
  right: 'lg:[transform:perspective(1100px)_rotateY(-9deg)]',
} as const;

/**
 * Tela pendurada do cockpit: moldura metálica presa ao console de teto por
 * duas hastes, vidro com linhas de varredura e teclas embaixo.
 */
export function CockpitMonitor({ title, subtitle, className = '', tilt, footer, help, children }: CockpitMonitorProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Hastes até o console de teto. */}
      <div aria-hidden className="absolute -top-3 left-[18%] h-3 w-1 rounded-t-sm bg-gradient-to-b from-slate-500 to-slate-700 sm:-top-4 sm:h-4" />
      <div aria-hidden className="absolute -top-3 right-[18%] h-3 w-1 rounded-t-sm bg-gradient-to-b from-slate-500 to-slate-700 sm:-top-4 sm:h-4" />
      <section className={`hull-panel overflow-hidden rounded-lg p-1 ${tilt ? TILT[tilt] : ''}`}>
        <header className="font-display flex items-baseline justify-between gap-2 px-1.5 pt-0.5 pb-1 text-[9px] tracking-[0.18em] text-cyan-300/90 uppercase sm:text-[10px]">
          {/* O título (com o zoom do telescópio) fica inteiro; o subtítulo usa o que sobra. */}
          <span className="flex max-w-full min-w-0 shrink-0 items-center gap-1">
            <span className="truncate whitespace-nowrap">{title}</span>
            {help && <InfoTip id={help} />}
          </span>
          {subtitle && <span className="hidden min-w-0 truncate text-slate-500 normal-case sm:inline">{subtitle}</span>}
        </header>
        <div className="scanlines relative aspect-[16/10] overflow-hidden sm:aspect-[4/3] rounded-sm border border-cyan-400/25 bg-black shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]">
          {children}
        </div>
        {footer}
      </section>
    </div>
  );
}

const keyClass = (active: boolean) =>
  `font-display rounded-sm border px-1 py-1 text-[9px] tracking-[0.12em] transition-colors sm:text-[10px] ${
    active
      ? 'border-cyan-300/70 bg-cyan-400/80 text-black shadow-[0_0_10px_rgba(34,211,238,0.45)]'
      : 'border-slate-600/70 bg-gradient-to-b from-slate-700/80 to-slate-900/90 text-slate-300 hover:from-slate-600'
  }`;

/** Fileira de teclas exclusivas abaixo de um monitor; `highlight` pulsa uma tecla sugerida. */
export function MonitorButtons<T extends string | number>({
  label,
  options,
  value,
  onChange,
  highlight = null,
}: {
  label: string;
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  highlight?: T | null;
}) {
  return (
    <div
      className="grid gap-1 px-0.5 pt-1"
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
          className={`${keyClass(o.value === value)} ${o.value === highlight && o.value !== value ? 'animate-beacon ring-2 ring-amber-300/80' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

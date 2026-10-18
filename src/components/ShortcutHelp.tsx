import { COCKPIT_SHORTCUTS, useShortcutHelp } from './useCockpitShortcuts';

/** Janela com os atalhos de teclado do cockpit ("?" abre e fecha; Esc fecha). */
export function ShortcutHelp() {
  const open = useShortcutHelp((s) => s.open);
  const setOpen = useShortcutHelp((s) => s.setOpen);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos do teclado"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div className="hull-panel w-full max-w-md rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-[11px] tracking-[0.25em] text-cyan-300 uppercase">⌨ Atalhos do teclado</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            ✕ Fechar
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-[13px]">
          {COCKPIT_SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt>
                <kbd className="font-readout rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-[12px] whitespace-nowrap text-cyan-100">
                  {s.keys}
                </kbd>
              </dt>
              <dd className="text-slate-200">{s.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { INDICATOR_HELP, type IndicatorId } from '../ui/indicatorHelp';

const MARGIN_PX = 8;
const GAP_PX = 6;
const MAX_WIDTH_PX = 288;

interface Placement {
  readonly left: number;
  readonly width: number;
  readonly top?: number;
  readonly bottom?: number;
}

/** Abaixo do ícone na metade de cima da tela, acima na de baixo; sempre dentro da tela. */
function placeNear(anchor: DOMRect): Placement {
  const width = Math.min(MAX_WIDTH_PX, window.innerWidth - 2 * MARGIN_PX);
  const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, MARGIN_PX), window.innerWidth - width - MARGIN_PX);
  return anchor.top + anchor.height / 2 < window.innerHeight / 2
    ? { left, width, top: anchor.bottom + GAP_PX }
    : { left, width, bottom: window.innerHeight - anchor.top + GAP_PX };
}

/**
 * Triângulo com exclamação ao lado de um visor: passando o mouse (ou tocando,
 * no celular) abre uma janela flutuante que explica o indicador. O toque fixa
 * a janela; tocar fora, rolar a tela ou Esc a fecham.
 */
export function InfoTip({ id, className = '' }: { id: IndicatorId; className?: string }) {
  const help = INDICATOR_HELP[id];
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [pinned, setPinned] = useState(false);

  const show = () => {
    if (button.current) setPlacement(placeNear(button.current.getBoundingClientRect()));
  };
  const hide = () => {
    setPlacement(null);
    setPinned(false);
  };

  useEffect(() => {
    if (!placement) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !popup.current?.contains(target)) hide();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [placement]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`O que é: ${help.title}`}
        aria-expanded={placement !== null}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && !pinned && hide()}
        onClick={() => {
          if (pinned) return hide();
          show();
          setPinned(true);
        }}
        className={`pointer-events-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-amber-300/80 hover:text-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300 ${className}`}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
          <path d="M8 1.5 L15 14.5 H1 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 6 V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="12.3" r="0.95" fill="currentColor" />
        </svg>
      </button>
      {placement &&
        createPortal(
          <div
            ref={popup}
            role="tooltip"
            style={{ left: placement.left, width: placement.width, top: placement.top, bottom: placement.bottom }}
            className="hull-panel fixed z-[70] rounded-md px-3 py-2 text-left font-sans text-[12px] leading-snug normal-case tracking-normal text-slate-200 shadow-2xl select-text"
          >
            <div className="font-display mb-1 text-[10px] tracking-[0.18em] text-amber-300 uppercase">{help.title}</div>
            {help.text}
          </div>,
          document.body,
        )}
    </>
  );
}

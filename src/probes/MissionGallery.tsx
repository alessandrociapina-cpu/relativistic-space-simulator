import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LICENSE_LABEL, MISSION_IMAGES, commonsImageUrl, commonsPageUrl, type MissionImage } from './missionImages';
import { MISSIONS, type ProbeId } from './missions';

type LoadState = 'loading' | 'ready' | 'error';

/** A imagem grande, com aviso enquanto carrega e quando não carrega (sem internet). */
function Viewer({ image }: { image: MissionImage }) {
  const [state, setState] = useState<LoadState>('loading');
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {state !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-xs text-slate-400">
          {state === 'loading' ? (
            'Carregando do Wikimedia Commons…'
          ) : (
            <>
              <span>Não foi possível carregar a imagem. Ela vem da internet (Wikimedia Commons).</span>
              <a href={commonsPageUrl(image.file)} target="_blank" rel="noreferrer" className="text-cyan-300 underline">
                Abrir no Commons ↗
              </a>
            </>
          )}
        </div>
      )}
      <img
        src={commonsImageUrl(image.file, 960)}
        srcSet={`${commonsImageUrl(image.file, 960)} 960w, ${commonsImageUrl(image.file, 1920)} 1920w`}
        sizes="(min-width: 1024px) 66vw, 100vw"
        alt={image.title}
        decoding="async"
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={`max-h-full max-w-full object-contain transition-opacity duration-300 ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

/** Miniatura; sem internet, mostra o título no lugar do ícone de imagem quebrada. */
function Thumb({ image }: { image: MissionImage }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] leading-tight text-slate-400">{image.title}</span>
  ) : (
    <img
      src={commonsImageUrl(image.file, 330)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

/**
 * Janela com as imagens marcantes da missão: a foto grande, a legenda com o
 * crédito e a licença e as miniaturas. As imagens vêm do Wikimedia Commons.
 */
export const MissionGallery = memo(function MissionGallery({
  missionId,
  initialIndex = 0,
  onClose,
}: {
  missionId: ProbeId;
  /** A foto mostrada primeiro (a mais próxima do evento, quando a galeria abre de um cartão). */
  initialIndex?: number;
  onClose: () => void;
}) {
  const mission = MISSIONS[missionId];
  const images = MISSION_IMAGES[missionId];
  const [index, setIndex] = useState(initialIndex);
  const image = images[Math.min(index, images.length - 1)]!;
  const closeButton = useRef<HTMLButtonElement>(null);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);

  useEffect(() => setIndex(initialIndex), [missionId, initialIndex]);
  useEffect(() => closeButton.current?.focus(), []);
  // Com dez fotos ou mais, a miniatura da foto aberta (pelas setas ou por um evento) pode estar fora da faixa.
  useEffect(() => {
    thumbs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const arrow =
    'absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-lg text-slate-100 hover:bg-black/85 disabled:hidden';

  // Num portal: o painel da sonda tem backdrop-blur, que prenderia o `fixed` dentro dele.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Imagens da missão ${mission.name}`}
      className="fixed inset-0 z-50 flex flex-col gap-2 bg-black/90 px-3 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] font-mono select-text sm:px-5"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[12px] tracking-widest text-cyan-300 uppercase">
            <span aria-hidden>📷 </span>
            {mission.name} · imagens
          </h2>
          <p className="text-[10px] text-slate-500">
            {index + 1} de {images.length} · do Wikimedia Commons (precisa de internet)
          </p>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-sm bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-700"
        >
          ✕ Fechar
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <figure className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-cyan-400/20 bg-black">
          <Viewer key={image.file} image={image} />
          <button type="button" aria-label="Imagem anterior" className={`${arrow} left-2`} disabled={images.length < 2} onClick={() => step(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Próxima imagem" className={`${arrow} right-2`} disabled={images.length < 2} onClick={() => step(1)}>
            ›
          </button>
        </figure>
        <figcaption className="max-h-[32vh] shrink-0 overflow-y-auto text-[12px] leading-relaxed text-slate-300 lg:max-h-none lg:w-80">
          <h3 className="text-[14px] text-white">{image.title}</h3>
          {image.date && <div className="text-[11px] text-amber-300 tabular-nums">{image.date}</div>}
          <p className="mt-1.5">{image.caption}</p>
          <p className="mt-2 text-[10px] text-slate-500">
            {image.credit} · {LICENSE_LABEL[image.license]} ·{' '}
            <a href={commonsPageUrl(image.file)} target="_blank" rel="noreferrer" className="text-cyan-300 underline">
              ver no Wikimedia Commons ↗
            </a>
          </p>
        </figcaption>
      </div>

      {images.length > 1 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Miniaturas">
          {images.map((img, i) => (
            <button
              key={img.file}
              ref={(el) => {
                thumbs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={img.title}
              title={img.title}
              onClick={() => setIndex(i)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-sm border bg-slate-900 sm:h-16 sm:w-24 ${
                i === index ? 'border-cyan-300 ring-1 ring-cyan-300' : 'border-slate-700 opacity-70 hover:opacity-100'
              }`}
            >
              <Thumb image={img} />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
});

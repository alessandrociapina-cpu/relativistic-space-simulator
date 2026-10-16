/**
 * Moldura da cabine na tela larga: as colunas laterais do para-brisa, que
 * ligam o console de teto ao painel. Só decoração: não intercepta o arrasto.
 */
export function CockpitFrame() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      <div className="absolute inset-y-0 left-0 w-[6vw] max-w-24 bg-gradient-to-r from-[#070b11] via-[#121a27] to-[#1b2535] [clip-path:polygon(0_0,100%_0,22%_100%,0_100%)]" />
      <div className="absolute inset-y-0 left-0 w-[6vw] max-w-24 bg-gradient-to-b from-cyan-300/25 via-cyan-300/5 to-transparent [clip-path:polygon(calc(100%-2px)_0,100%_0,22%_100%,calc(22%-2px)_100%)]" />
      <div className="absolute inset-y-0 right-0 w-[6vw] max-w-24 bg-gradient-to-l from-[#070b11] via-[#121a27] to-[#1b2535] [clip-path:polygon(0_0,100%_0,100%_100%,78%_100%)]" />
      <div className="absolute inset-y-0 right-0 w-[6vw] max-w-24 bg-gradient-to-b from-cyan-300/25 via-cyan-300/5 to-transparent [clip-path:polygon(0_0,2px_0,calc(78%+2px)_100%,78%_100%)]" />
    </div>
  );
}

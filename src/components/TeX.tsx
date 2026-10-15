import katex from 'katex';
import 'katex/dist/katex.min.css';
import { memo, useMemo } from 'react';

/**
 * Fórmula TeX renderizada pelo KaTeX em estilo de exibição, mas em linha
 * (alinhada à esquerda). O TeX vem só do catálogo de explicações.
 */
export const TeX = memo(function TeX({ tex, className = '' }: { tex: string; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(`\\displaystyle ${tex}`, { throwOnError: false, strict: 'ignore' }),
    [tex],
  );
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});

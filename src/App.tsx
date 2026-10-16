import { Suspense, lazy } from 'react';
import { RelativisticCockpit } from './components/RelativisticCockpit';
import { useAppMode } from './ui/appMode';

// O simulador de sondas (cena, dados do JPL e KaTeX) só carrega quando é aberto.
const ProbesApp = lazy(() => import('./probes/ProbesApp').then((m) => ({ default: m.ProbesApp })));

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black font-mono text-xs tracking-widest text-cyan-300/80 uppercase">
      Carregando o Sistema Solar…
    </div>
  );
}

export default function App() {
  return useAppMode() === 'probes' ? (
    <Suspense fallback={<Loading />}>
      <ProbesApp />
    </Suspense>
  ) : (
    <RelativisticCockpit />
  );
}

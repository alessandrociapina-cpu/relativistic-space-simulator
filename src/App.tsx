import { Suspense, lazy } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { useAppMode } from './ui/appMode';

// O cockpit (Three.js e o céu) e o simulador de sondas (cena, dados do JPL e
// KaTeX) só carregam quando são abertos: a abertura aparece na hora.
const RelativisticCockpit = lazy(() =>
  import('./components/RelativisticCockpit').then((m) => ({ default: m.RelativisticCockpit })),
);
const ProbesApp = lazy(() => import('./probes/ProbesApp').then((m) => ({ default: m.ProbesApp })));

function Loading({ label }: { label: string }) {
  return (
    <div className="font-display flex h-full w-full items-center justify-center bg-black text-xs tracking-[0.3em] text-cyan-300/80 uppercase">
      {label}
    </div>
  );
}

export default function App() {
  const mode = useAppMode();
  if (mode === 'home') return <SplashScreen />;
  return mode === 'probes' ? (
    <Suspense fallback={<Loading label="Carregando o Sistema Solar…" />}>
      <ProbesApp />
    </Suspense>
  ) : (
    <Suspense fallback={<Loading label="Preparando a nave…" />}>
      <RelativisticCockpit />
    </Suspense>
  );
}

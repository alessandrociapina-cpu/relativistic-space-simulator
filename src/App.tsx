import { Suspense, lazy } from 'react';
import { AppNav } from './components/AppNav';
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

/** A barra de navegação em cima e a tela da seção embaixo, ocupando o resto. */
export default function App() {
  const mode = useAppMode();
  return (
    <div className="flex h-full w-full flex-col bg-black">
      <AppNav mode={mode} />
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          {mode === 'home' ? (
            <SplashScreen />
          ) : mode === 'probes' ? (
            <Suspense fallback={<Loading label="Carregando o Sistema Solar…" />}>
              <ProbesApp />
            </Suspense>
          ) : (
            <Suspense fallback={<Loading label="Preparando a nave…" />}>
              <RelativisticCockpit />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

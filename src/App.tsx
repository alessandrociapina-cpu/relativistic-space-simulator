import { useFlightAudio } from './audio/useFlightAudio';
import { FlightControls } from './components/FlightControls';
import { MainViewport } from './components/MainViewport';
import { RearCameraPIP } from './components/RearCameraPIP';
import { TelemetryHUD } from './components/TelemetryHUD';
import { TelescopePIP } from './components/TelescopePIP';
import { useFlightLoop } from './store/useFlightLoop';

export default function App() {
  useFlightLoop();
  useFlightAudio();

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none">
      <MainViewport className="absolute inset-0" />
      {/* Áreas vazias deixam o arrasto passar para o para-brisa. O padding respeita
          entalhe e barra de gestos quando o PWA roda em tela cheia. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <div className="flex items-start justify-between gap-3">
          <TelescopePIP className="pointer-events-auto w-[44%] max-w-xs" />
          <RearCameraPIP className="pointer-events-auto w-[44%] max-w-xs" />
        </div>
        <div className="pointer-events-auto mx-auto flex w-full max-w-4xl flex-col gap-2">
          <TelemetryHUD />
          <FlightControls />
        </div>
      </div>
    </div>
  );
}

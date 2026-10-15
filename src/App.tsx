import { DESTINATION_LIST, destinationMissionProfile } from './physics/destinations';
import { JULIAN_YEAR_S } from './physics/RelativityEngine';

// Placeholder da Etapa 1: confirma que o motor físico está ligado ao app.
// A cena 3D, o HUD e os controles entram nas próximas etapas.
export default function App() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-6 font-mono text-slate-200">
      <h1 className="text-xl tracking-[0.3em] text-cyan-300 uppercase">Simulador Relativístico</h1>
      <table className="text-sm">
        <thead className="text-slate-400">
          <tr>
            <th className="px-3 py-1 text-left font-normal">Destino</th>
            <th className="px-3 py-1 text-right font-normal">Bordo</th>
            <th className="px-3 py-1 text-right font-normal">Terra</th>
            <th className="px-3 py-1 text-right font-normal">γ máx</th>
          </tr>
        </thead>
        <tbody>
          {DESTINATION_LIST.map((d) => {
            const p = destinationMissionProfile(d);
            return (
              <tr key={d.id}>
                <td className="px-3 py-1">{d.name}</td>
                <td className="px-3 py-1 text-right">{(p.tauTotal / 60).toFixed(1)} min</td>
                <td className="px-3 py-1 text-right">{(p.tTotal / JULIAN_YEAR_S).toLocaleString('pt-BR')} anos</td>
                <td className="px-3 py-1 text-right">{p.gammaMax.toExponential(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

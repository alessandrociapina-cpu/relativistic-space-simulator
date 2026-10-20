import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fontes do painel, empacotadas (o app funciona offline): só o subconjunto latino.
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/share-tech-mono/latin-400.css';
import './index.css';
import App from './App.tsx';
import { watchAppUpdate } from './ui/buildInfo';

// Uma versão nova instalada em segundo plano aparece na abertura, com "Recarregar".
watchAppUpdate();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root não encontrado');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

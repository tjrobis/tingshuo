import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Placeholder shell until the MVP slice lands (ROADMAP.md, slice 4). Not a fake feature: it says so.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="grid min-h-dvh place-content-center gap-3 p-6 text-center">
      <h1 className="text-4xl font-semibold">
        听说 <span className="text-slate-400">Tīngshuō</span>
      </h1>
      <p className="text-slate-500">Under construction: the learning engine is being built. See ROADMAP.md.</p>
    </main>
  </StrictMode>,
);

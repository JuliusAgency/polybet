import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { attemptChunkReload } from '@/shared/utils';

// Recover from stale chunks after a deploy: when a dynamically imported module
// fails to load (old hashed filename removed by the new build), reload once to
// fetch the fresh index.html + chunks. See shared/utils/chunkReload.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault(); // suppress the default unhandledrejection
  attemptChunkReload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

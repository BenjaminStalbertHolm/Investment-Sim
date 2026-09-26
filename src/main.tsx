import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '98.css/dist/98.css';
import './shell/shell.css';
import './ui98/ui98.css';
import { Shell } from './shell/Shell';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);

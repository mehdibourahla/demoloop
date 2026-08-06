import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/atomics.css';

const params = new URLSearchParams(location.search);
const who = {
  user: params.get('user') ?? 'ada',
  workspace: params.get('workspace') ?? ''
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App who={who} />
  </StrictMode>
);

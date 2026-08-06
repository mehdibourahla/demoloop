import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Watch } from './screens/Watch';
import './styles/tokens.css';
import './styles/app.css';
import './styles/atomics.css';

const params = new URLSearchParams(location.search);
const who = {
  user: params.get('user') ?? 'ada',
  workspace: params.get('workspace') ?? ''
};

// The public watch page carries no session; it is a different audience on the same origin.
const shared = location.pathname.match(/^\/watch\/(.+)$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shared ? <Watch token={shared[1]} /> : <App who={who} />}
  </StrictMode>
);

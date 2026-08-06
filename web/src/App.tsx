import { useState } from 'react';
import type { Identity } from './api';
import { Health } from './screens/Health';
import { Library } from './screens/Library';
import { Player } from './screens/Player';
import { Reconnaissance } from './screens/Reconnaissance';

const SURFACES = [
  { id: 'reconnaissance', label: 'Reconnaissance' },
  { id: 'library', label: 'Library' },
  { id: 'productions', label: 'Productions' },
  { id: 'health', label: 'Health' }
] as const;

type Surface = (typeof SURFACES)[number]['id'];

export function App({ who }: { who: Identity }) {
  const [surface, setSurface] = useState<Surface>('reconnaissance');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [opened, setOpened] = useState<string | undefined>();

  return (
    <div className="app" data-theme={theme}>
      <nav className="nav">
        <div className="ws">
          <span className="mk" />
          <span className="nm">Demoloop</span>
        </div>
        <div className="nav-b">
          <div className="nav-s">Workspace</div>
          {SURFACES.map((entry) => (
            <div
              key={entry.id}
              className={`ni ${surface === entry.id ? 'on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setSurface(entry.id)}
              onKeyDown={(event) => event.key === 'Enter' && setSurface(entry.id)}
            >
              {entry.label}
            </div>
          ))}
        </div>
        <div className="nav-f">
          <span className="av">{who.user.slice(0, 2).toUpperCase()}</span>
          <span className="dim" style={{ fontSize: 12 }}>{who.user}</span>
          <button className="btn xs" style={{ marginLeft: 'auto' }} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>
      </nav>

      <main className="main">
        <div className="ph">
          <div className="ph-t">
            <div>
              <h1>{SURFACES.find((entry) => entry.id === surface)!.label}</h1>
              <p className="ph-sub">Every frame is the real product, driven live.</p>
            </div>
          </div>
        </div>
        {surface === 'reconnaissance' && <Reconnaissance who={who} />}
        {surface === 'library' && <Library who={who} onOpen={(id) => { setOpened(id); setSurface('productions'); }} />}
        {surface === 'productions' && <Player who={who} opened={opened} />}
        {surface === 'health' && <Health who={who} />}
      </main>
    </div>
  );
}

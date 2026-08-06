import { useState } from 'react';
import { api, type Identity, type Reconnaissance as Recon } from '../api';
import { Empty, SectionHeader, Status } from '../components';

export function Reconnaissance({ who }: { who: Identity }) {
  const [url, setUrl] = useState('http://127.0.0.1:4173');
  const [root, setRoot] = useState('');
  const [found, setFound] = useState<Recon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const started = await api.startReconnaissance(who, {
        app: { url },
        ...(root ? { repository: { root } } : {})
      });
      setFound(await api.reconnaissance(who, started.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (found) setFound(await api.reconnaissance(who, found.id));
  }

  return (
    <div className="page-b">
      <SectionHeader title="Connect" />
      <div className="fx gap13" style={{ maxWidth: 720, marginBottom: 22 }}>
        <input className="input" aria-label="Environment URL" value={url} onChange={(event) => setUrl(event.target.value)} />
        <input className="input" aria-label="Repository root" placeholder="repository root (optional)" value={root} onChange={(event) => setRoot(event.target.value)} />
        <button className="btn pri" onClick={begin} disabled={busy}>{busy ? 'Reading…' : 'Explore'}</button>
      </div>

      {error && <p className="chip bad" role="alert">{error}</p>}

      {found && (
        <>
          <SectionHeader
            title="Product map"
            aside={<span className="fx ac gap10"><Status value={found.status} /><button className="btn xs" onClick={refresh}>Refresh</button></span>}
          />
          {found.model?.product
            ? (
              <div className="kv" style={{ marginBottom: 20 }}>
                <div><span className="k">Product</span><span className="v">{found.model.product}</span></div>
                <div><span className="k">Surfaces</span><span className="v mono">{found.model.proofSurfaces?.length ?? 0}</span></div>
                <div><span className="k">Outputs planned</span><span className="v mono">{found.plan?.outputs?.length ?? 0}</span></div>
              </div>
            )
            : <Empty>Reconnaissance is running. Every line becomes inspectable evidence as it lands.</Empty>}

          {found.plan?.outputs?.length
            ? (
              <table className="tbl">
                <tbody>
                  <tr><th>Demo</th><th>Scenes</th></tr>
                  {found.plan.outputs.map((output) => (
                    <tr key={output.id}>
                      <td>{output.title}</td>
                      <td className="mono">{output.scenes.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
            : null}
        </>
      )}
    </div>
  );
}

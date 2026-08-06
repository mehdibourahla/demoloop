import { useEffect, useState } from 'react';
import { api, type Identity, type Production } from '../api';
import { Empty, SectionHeader, Shot, Status } from '../components';

export function Player({ who, opened }: { who: Identity; opened?: string }) {
  const [productionId, setProductionId] = useState(opened ?? '');
  const [shown, setShown] = useState<Production | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (opened) { setProductionId(opened); void open(opened); } }, [opened]);

  async function open(id: string) {
    setError(null);
    try { setShown(await api.production(who, id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }

  async function load() {
    setError(null);
    try {
      setShown(await api.production(who, productionId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <div className="page-b">
      <SectionHeader title="Production" />
      <div className="fx gap13" style={{ maxWidth: 620, marginBottom: 22 }}>
        <input className="input" aria-label="Production" placeholder="production id" value={productionId} onChange={(event) => setProductionId(event.target.value)} />
        <button className="btn" onClick={load} disabled={!productionId}>Open</button>
      </div>

      {error && <p className="chip bad" role="alert">{error}</p>}

      {shown && (
        <>
          <SectionHeader title="Master" aside={<Status value={shown.status} />} />
          {shown.video
            ? <video controls src={shown.video} style={{ width: '100%', maxWidth: 860, border: '1px solid var(--line)' }} />
            : <div style={{ maxWidth: 860 }}><Shot label="the recorded master appears here once production completes" /></div>}
        </>
      )}

      {!shown && <Empty>Name a production to watch its master.</Empty>}
    </div>
  );
}

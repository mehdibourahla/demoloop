import { useState } from 'react';
import { api, type Identity, type Verification } from '../api';
import { Empty, SectionHeader, Status } from '../components';

export function Health({ who }: { who: Identity }) {
  const [productionId, setProductionId] = useState('');
  const [check, setCheck] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setError(null);
    try {
      const started = await api.startVerification(who, productionId);
      setCheck(await api.verification(who, started.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function refresh() {
    if (check) setCheck(await api.verification(who, check.id));
  }

  return (
    <div className="page-b">
      <SectionHeader title="Demo health" />
      <div className="fx gap13" style={{ maxWidth: 620, marginBottom: 22 }}>
        <input className="input" aria-label="Production" placeholder="production id" value={productionId} onChange={(event) => setProductionId(event.target.value)} />
        <button className="btn" onClick={verify} disabled={!productionId}>Re-check</button>
      </div>

      {error && <p className="chip bad" role="alert">{error}</p>}

      {check
        ? (
          <>
            <SectionHeader
              title="Result"
              aside={<span className="fx ac gap10"><Status value={check.status} /><button className="btn xs" onClick={refresh}>Refresh</button></span>}
            />
            {check.drifted.length === 0
              ? <Empty>Every target still resolves against the current product.</Empty>
              : (
                <table className="tbl">
                  <tbody>
                    <tr><th>Scene</th><th>Target</th><th>Finding</th><th>Matches</th></tr>
                    {check.drifted.map((entry) => (
                      <tr key={`${entry.sceneId}-${entry.label}`}>
                        <td className="mono">{entry.sceneId}</td>
                        <td>{entry.label}</td>
                        <td><Status value={entry.status === 'ambiguous' ? 'repairable' : 'drifted'} /></td>
                        <td className="mono">{entry.matches}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </>
        )
        : <Empty>Name a production to re-resolve its targets against the product as it is now.</Empty>}
    </div>
  );
}

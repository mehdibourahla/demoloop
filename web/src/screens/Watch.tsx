import { useEffect, useState } from 'react';
import { watch, type Receipt } from '../api';
import { SectionHeader, Shot } from '../components';

export function Watch({ token }: { token: string }) {
  const [state, setState] = useState<{ video: string | null; receipt: Receipt } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => { watch(token).then(setState).catch(() => setMissing(true)); }, [token]);

  if (missing) return <div className="page"><div className="page-b"><h1>This link is not available.</h1></div></div>;
  if (!state) return <div className="page"><div className="page-b"><p className="dim3">Loading…</p></div></div>;

  const { receipt } = state;
  return (
    <div className="page">
      <div className="page-b" style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1>{receipt.title ?? 'A recorded demonstration'}</h1>
        <div style={{ margin: '18px 0' }}>
          {state.video
            ? <video controls src={state.video} style={{ width: '100%', border: '1px solid var(--line)' }} />
            : <Shot label="this demonstration has no master" />}
        </div>
        <SectionHeader title="Receipt" />
        <div className="kv">
          <div><span className="k">Commit</span><span className="v mono">{receipt.commit ?? 'unknown'}</span></div>
          <div><span className="k">Environment</span><span className="v mono">{receipt.environment ?? 'unknown'}</span></div>
          <div><span className="k">Recorded</span><span className="v mono">{receipt.recordedAt?.slice(0, 10) ?? '—'}</span></div>
          <div><span className="k">Agent review</span><span className="v mono">{receipt.agentScore ?? '—'}</span></div>
        </div>
        <p className="dim" style={{ marginTop: 18, fontSize: 12.5 }}>
          Every frame was captured from the running application.
          {receipt.dirty ? ' The working tree carried uncommitted changes at capture time.' : ''}
        </p>
      </div>
    </div>
  );
}

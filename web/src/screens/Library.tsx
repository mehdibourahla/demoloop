import { useEffect, useState } from 'react';
import { api, type Identity, type LibraryEntry } from '../api';
import { Empty, SectionHeader, Status } from '../components';

export function Library({ who, onOpen }: { who: Identity; onOpen: (id: string) => void }) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.library(who)
      .then((result) => setEntries(result.productions))
      .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
  }, [who.user, who.workspace]);

  if (error) return <div className="page-b"><p className="chip bad" role="alert">{error}</p></div>;
  if (!entries) return <div className="page-b"><Empty>Reading the library…</Empty></div>;

  return (
    <div className="page-b">
      <SectionHeader title="Demos" aside={<span className="label">{entries.length} total</span>} />
      {entries.length === 0
        ? <Empty>No demos yet. Explore a product to see what is worth making.</Empty>
        : (
          <table className="tbl">
            <tbody>
              <tr><th>Demo</th><th>Status</th><th>Master</th><th>Shared</th><th /></tr>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.title ?? <span className="dim3">untitled</span>}</td>
                  <td><Status value={entry.status} /></td>
                  <td className="mono dim3">{entry.hasVideo ? 'ready' : '—'}</td>
                  <td className="mono dim3">{entry.published ? entry.published.slice(0, 10) : '—'}</td>
                  <td><button className="btn xs" onClick={() => onOpen(entry.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, type Identity, type MapSummary, type Reconnaissance } from '../api';
import { Empty, SectionHeader, Status } from '../components';

const CLAIMS = [
  ['capabilities', 'Capabilities'],
  ['journeys', 'Journeys'],
  ['proofSurfaces', 'Proof surfaces'],
  ['actors', 'Actor contexts']
] as const;

export function ProductMap({ who }: { who: Identity }) {
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [detail, setDetail] = useState<Reconnaissance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.maps(who)
      .then((result) => setMaps(result.reconnaissances))
      .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
  }, [who.user, who.workspace]);

  if (error) return <div className="page-b"><p className="chip bad" role="alert">{error}</p></div>;
  if (!maps) return <div className="page-b"><Empty>Reading the map…</Empty></div>;

  return (
    <div className="page-b">
      <SectionHeader title="Product maps" aside={<span className="label">{maps.length} versions</span>} />
      {maps.length === 0
        ? <Empty>Nothing mapped yet. Explore a product and its map is built from evidence.</Empty>
        : (
          <table className="tbl">
            <tbody>
              <tr>
                <th>Product</th><th>Status</th>
                {CLAIMS.map(([key, label]) => <th key={key}>{label}</th>)}
                <th />
              </tr>
              {maps.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.product ?? <span className="dim3">not yet named</span>}</td>
                  <td><Status value={entry.status} /></td>
                  {CLAIMS.map(([key]) => <td key={key} className="mono">{entry.counts[key]}</td>)}
                  <td>
                    <button className="btn xs" onClick={async () => setDetail(await api.reconnaissance(who, entry.id))}>
                      Evidence
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      {detail?.model && (
        <>
          <SectionHeader title="Proof surfaces" aside={<Status value={detail.status} />} />
          {(detail.model.proofSurfaces ?? []).length === 0
            ? <Empty>No proof surface carried runtime evidence.</Empty>
            : (
              <table className="tbl">
                <tbody>
                  <tr><th>Surface</th><th>Route</th></tr>
                  {(detail.model.proofSurfaces ?? []).map((surface) => (
                    <tr key={surface.id}>
                      <td>{surface.name}</td>
                      <td className="mono dim3">{surface.route ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </>
      )}
    </div>
  );
}

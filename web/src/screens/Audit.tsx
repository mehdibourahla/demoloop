import { useEffect, useState } from 'react';
import { api, type AuditEvent, type Identity } from '../api';
import { Empty, SectionHeader } from '../components';

export function Audit({ who }: { who: Identity }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  useEffect(() => { api.audit(who).then((result) => setEvents(result.events)).catch(() => setEvents([])); },
    [who.user, who.workspace]);

  if (!events) return <div className="page-b"><Empty>Reading the log…</Empty></div>;

  return (
    <div className="page-b">
      <SectionHeader title="Audit log" aside={<span className="label">append only</span>} />
      {events.length === 0
        ? <Empty>Nothing has happened in this workspace yet.</Empty>
        : (
          <table className="tbl">
            <tbody>
              <tr><th>When</th><th>Who</th><th>Did</th><th>To</th></tr>
              {events.map((event, index) => (
                <tr key={`${event.at}-${index}`}>
                  <td className="mono dim3">{event.at.slice(0, 19).replace('T', ' ')}</td>
                  <td>{event.actor}</td>
                  <td>{event.action}</td>
                  <td className="mono dim3">{event.subject.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

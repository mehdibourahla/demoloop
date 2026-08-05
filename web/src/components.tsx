export type Health = 'fresh' | 'repairable' | 'drifted' | 'complete' | 'failed' | string;

const MARKER: Record<string, string> = {
  fresh: 'ok', complete: 'ok', repairable: 'warn', drifted: 'warn', failed: 'bad', checking: 'info'
};

export function Status({ value }: { value: Health }) {
  return <span className={`chip ${MARKER[value] ?? 'info'}`}>{value}</span>;
}

export function SectionHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="sh">
      <h3>{title}</h3>
      {aside}
    </div>
  );
}

export function Shot({ label }: { label: string }) {
  return <div className="shot" style={{ aspectRatio: '16 / 9' }}>{label}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="dim3" style={{ fontSize: 12.5, padding: '18px 0' }}>{children}</p>;
}

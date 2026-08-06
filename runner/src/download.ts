import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export type GrantDownloads = (keys: string[]) => Promise<Record<string, string>>;

export async function downloadArtifacts(
  artifacts: Record<string, string>,
  grant: GrantDownloads
): Promise<Record<string, string>> {
  const keys = Object.values(artifacts);
  if (keys.length === 0) return {};
  const urls = await grant(keys);
  const directory = await mkdtemp(join(tmpdir(), 'demoloop-fetch-'));
  const local: Record<string, string> = {};
  for (const [name, key] of Object.entries(artifacts)) {
    const url = urls[key];
    if (!url) throw new Error(`No download URL was granted for ${key}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`object download failed (${response.status}) for ${key}`);
    const path = join(directory, basename(key));
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
    local[name] = path;
  }
  return local;
}

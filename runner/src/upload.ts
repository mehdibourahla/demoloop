import { readFile } from 'node:fs/promises';

export interface UploadGrant { urls: Record<string, string>; keys: Record<string, string> }
export type GrantUrls = (names: string[]) => Promise<UploadGrant>;
export type PutObject = (url: string, body: Buffer) => Promise<void>;

export async function uploadArtifacts(
  artifacts: Record<string, string>,
  grant: GrantUrls,
  put: PutObject
): Promise<Record<string, string>> {
  const names = Object.keys(artifacts);
  if (names.length === 0) return {};
  const { urls, keys } = await grant(names);
  for (const name of names) {
    const url = urls[name];
    if (!url) throw new Error(`No upload URL was granted for ${name}`);
    await put(url, await readFile(artifacts[name]));
  }
  return keys;
}

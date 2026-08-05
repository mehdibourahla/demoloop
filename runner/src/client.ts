import type { AgentDeps, LeasedJob } from './agent.js';
import { capture, type CapturePayload } from './stages/capture.js';
import { render, type RenderPayload } from './stages/render.js';
import { evaluate } from './stages/evaluate.js';
import { downloadArtifacts } from './download.js';
import { uploadArtifacts, type UploadGrant } from './upload.js';

async function post(api: string, token: string, path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, api), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

export function httpDeps(api: string, token: string): AgentDeps {
  let current: { id: string; lease_token: string } | undefined;
  return {
    async lease(kinds) {
      const response = await post(api, token, '/v1/jobs/lease', { kinds });
      if (response.status === 204) return undefined;
      if (!response.ok) throw new Error(`lease failed (${response.status}): ${await response.text()}`);
      const body = await response.json() as LeasedJob;
      current = { id: body.job.id, lease_token: body.lease_token };
      return body;
    },
    async beat(id, lease_token) {
      const response = await post(api, token, `/v1/jobs/${id}/beat`, { lease_token });
      return response.ok;
    },
    async upload(artifacts) {
      if (!current) throw new Error('No job is leased');
      const job = current;
      return uploadArtifacts(
        artifacts,
        async (names) => {
          const response = await post(api, token, `/v1/jobs/${job.id}/uploads`, { lease_token: job.lease_token, names });
          if (!response.ok) throw new Error(`upload grant failed (${response.status}): ${await response.text()}`);
          return await response.json() as UploadGrant;
        },
        async (url, body) => {
          const put = await fetch(url, { method: 'PUT', body: new Uint8Array(body) });
          if (!put.ok) throw new Error(`object upload failed (${put.status})`);
        }
      );
    },
    async execute(kind, payload) {
      if (kind === 'capture') return capture(payload as unknown as CapturePayload);
      if (kind === 'render' || kind === 'evaluate') {
        if (!current) throw new Error('No job is leased');
        const job = current;
        const stage = kind === 'render' ? render : evaluate;
        return stage(payload as unknown as RenderPayload, {
          download: async (artifacts) => downloadArtifacts(artifacts, async (keys) => {
            const response = await post(api, token, `/v1/jobs/${job.id}/downloads`, { lease_token: job.lease_token, keys });
            if (!response.ok) throw new Error(`download grant failed (${response.status}): ${await response.text()}`);
            return (await response.json() as { urls: Record<string, string> }).urls;
          })
        });
      }
      throw new Error(`Unsupported job kind: ${kind}`);
    },
    async finish(id, lease_token, body) {
      const response = await post(api, token, `/v1/jobs/${id}/finish`, { lease_token, ...body });
      if (!response.ok) throw new Error(`finish failed (${response.status}): ${await response.text()}`);
    }
  };
}

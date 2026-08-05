import type { AgentDeps, LeasedJob } from './agent.js';
import { capture } from './capture.js';
import type { CapturePayload } from './capture.js';

async function post(api: string, token: string, path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, api), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

export function httpDeps(api: string, token: string): AgentDeps {
  return {
    async lease(kinds) {
      const response = await post(api, token, '/v1/jobs/lease', { kinds });
      if (response.status === 204) return undefined;
      if (!response.ok) throw new Error(`lease failed (${response.status}): ${await response.text()}`);
      return await response.json() as LeasedJob;
    },
    async beat(id, lease_token) {
      const response = await post(api, token, `/v1/jobs/${id}/beat`, { lease_token });
      return response.ok;
    },
    async capture(payload) {
      return capture(payload as unknown as CapturePayload);
    },
    async finish(id, lease_token, body) {
      const response = await post(api, token, `/v1/jobs/${id}/finish`, { lease_token, ...body });
      if (!response.ok) throw new Error(`finish failed (${response.status}): ${await response.text()}`);
    }
  };
}

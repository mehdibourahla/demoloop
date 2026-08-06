export interface Reconnaissance {
  id: string;
  status: string;
  model: { product?: string; proofSurfaces?: Array<{ id: string; name: string; route?: string }> } | null;
  plan: { status?: string; outputs?: Array<{ id: string; title: string; scenes: unknown[] }> } | null;
}

export interface Production {
  id: string;
  status: string;
  video: string | null;
}

export interface Verification {
  id: string;
  status: string;
  drifted: Array<{ sceneId: string; label: string; status: string; matches: number }>;
  checkedAt: string | null;
}

export interface Identity {
  user: string;
  workspace: string;
}

async function call<T>(identity: Identity, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'X-Demoloop-User': identity.user,
      'X-Demoloop-Workspace': identity.workspace,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status})`);
  return await response.json() as T;
}

export const api = {
  startReconnaissance: (who: Identity, config: unknown) =>
    call<{ id: string }>(who, '/v1/reconnaissance', { method: 'POST', body: JSON.stringify({ config }) }),
  reconnaissance: (who: Identity, id: string) => call<Reconnaissance>(who, `/v1/reconnaissance/${id}`),
  startProduction: (who: Identity, scenario: unknown, config: unknown, estimatedCredits = 0) =>
    call<{ id: string }>(who, '/v1/productions', {
      method: 'POST',
      body: JSON.stringify({ scenario, config, estimated_credits: estimatedCredits })
    }),
  production: (who: Identity, id: string) => call<Production>(who, `/v1/productions/${id}`),
  startVerification: (who: Identity, productionId: string) =>
    call<{ id: string }>(who, `/v1/productions/${productionId}/verifications`, { method: 'POST' }),
  verification: (who: Identity, id: string) => call<Verification>(who, `/v1/verifications/${id}`)
};

import { planDemo, type PlanOptions } from '../../../src/planner.js';
import { PlanResultSchema, ProductModelSchema } from '../../../src/schemas.js';

export interface PlanPayload {
  model: unknown;
  mode?: PlanOptions['mode'];
  journeyId?: string;
  capabilityId?: string;
  actorId?: string;
  locale?: string;
  audience?: string;
  requestedDurationSeconds?: number;
}

export async function plan(payload: PlanPayload): Promise<Record<string, unknown>> {
  const model = ProductModelSchema.parse(payload.model);
  const result = PlanResultSchema.parse(planDemo(model, {
    mode: payload.mode ?? 'full',
    journeyId: payload.journeyId,
    capabilityId: payload.capabilityId,
    actorId: payload.actorId,
    locale: payload.locale ?? 'en',
    audience: payload.audience,
    requestedDurationSeconds: payload.requestedDurationSeconds,
    audio: { policy: 'silent' }
  }));
  return { passed: result.status === 'planned', plan: result };
}

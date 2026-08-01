import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ConfigSchema, ExecutionReportSchema, ProductModelSchema, QualityReportSchema, ScenarioSchema, TimelineSchema } from './schemas.js';

const schemas = { config: ConfigSchema, 'product-model': ProductModelSchema, scenario: ScenarioSchema, timeline: TimelineSchema, 'execution-report': ExecutionReportSchema, 'quality-report': QualityReportSchema };
const output = resolve('schemas');
await mkdir(output, { recursive: true });
for (const [name, schema] of Object.entries(schemas)) await writeFile(resolve(output, `${name}.schema.json`), JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7' }), null, 2));

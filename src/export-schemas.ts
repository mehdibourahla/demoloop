import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { contractSchemas } from './schemas.js';

const output = resolve('schemas');
await mkdir(output, { recursive: true });
for (const [name, schema] of Object.entries(contractSchemas)) await writeFile(resolve(output, `${name}.schema.json`), JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7' }), null, 2));

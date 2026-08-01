import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4173);
let intake: Record<string, string> = {};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/health') return void response.end('ok');
  if (url.pathname === '/api/reset' && request.method === 'POST') {
    intake = {};
    response.setHeader('content-type', 'application/json');
    return void response.end('{"ok":true}');
  }
  if (url.pathname === '/api/intake' && request.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    intake = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, string>;
    response.setHeader('content-type', 'application/json');
    return void response.end('{"ok":true}');
  }
  if (url.pathname === '/api/brief') {
    response.setHeader('content-type', 'application/json');
    return void response.end(JSON.stringify(intake));
  }
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(await readFile(join(root, 'app.html')));
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`SanoX fixture http://127.0.0.1:${port}\n`));

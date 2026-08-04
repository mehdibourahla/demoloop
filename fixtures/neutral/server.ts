import { createServer } from 'node:http';

const state = new Map<string, string>();

const pages: Record<string, string> = {
  stateful: `<h1>Workspace items</h1><button>Create item</button><output>Ready</output><script>document.querySelector('button').onclick=()=>document.querySelector('output').textContent='Item created'</script>`,
  handoff: `<h1>Delivery board</h1><button>Send item</button><button>Refresh inbox</button><output>Ready</output><script>const o=document.querySelector('output');document.querySelectorAll('button')[0].onclick=async()=>{await fetch('/api/handoff',{method:'POST'});o.textContent='Item sent'};document.querySelectorAll('button')[1].onclick=async()=>{const r=await fetch('/api/handoff');o.textContent=(await r.text())}</script>`,
  analytics: `<h1>Signal comparison</h1><label>Window<select><option>month</option><option>week</option></select></label><output>18%</output><script>document.querySelector('select').onchange=()=>document.querySelector('output').textContent='42%'</script>`,
  operations: `<h1>Runtime check</h1><button>Run check</button><pre>Idle</pre><script>document.querySelector('button').onclick=()=>document.querySelector('pre').textContent='Check passed\n3 targets healthy'</script>`,
  mobile: `<h1>Quick capture</h1><button>Add entry</button><output>Empty</output><script>document.querySelector('button').onclick=()=>document.querySelector('output').textContent='Entry added'</script>`,
  'route-only': `<h1>Route catalog</h1><nav><a href="/route-only/overview">Overview</a><a href="/route-only/activity">Activity</a></nav>`
};

const shell = (body: string) => `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;max-width:720px;margin:60px auto;padding:24px}button,select{font:inherit;padding:12px;margin:12px}output,pre{display:block;padding:24px;background:#eef4ff}</style><body>${body}</body></html>`;

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') { response.end('ok'); return; }
  if (url.pathname === '/api/reset') { state.clear(); response.end('ok'); return; }
  if (url.pathname === '/api/handoff') {
    if (request.method === 'POST') { state.set('handoff', 'Item received'); response.end('Item sent'); return; }
    response.end(state.get('handoff') ?? 'Inbox empty'); return;
  }
  const key = url.pathname.split('/').filter(Boolean)[0] ?? 'stateful';
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(shell(pages[key] ?? pages.stateful));
}).listen(Number(process.env.PORT ?? 4173), '127.0.0.1');

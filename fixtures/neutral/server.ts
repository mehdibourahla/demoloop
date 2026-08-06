import { createServer } from 'node:http';

const state = new Map<string, string>();

const pages: Record<string, string> = {
  stateful: `<h1>Workspace items</h1><button>Create item</button><output>Ready</output><script>document.querySelector('button').onclick=()=>document.querySelector('output').textContent='Item created'</script>`,
  handoff: `<h1>Delivery board</h1><button>Send item</button><button>Refresh inbox</button><output>Ready</output><script>const o=document.querySelector('output');document.querySelectorAll('button')[0].onclick=async()=>{await fetch('/api/handoff',{method:'POST'});o.textContent='Item sent'};document.querySelectorAll('button')[1].onclick=async()=>{const r=await fetch('/api/handoff');o.textContent=(await r.text())}</script>`,
  analytics: `<h1>Signal comparison</h1><label>Window<select><option>month</option><option>week</option></select></label><output>18%</output><script>document.querySelector('select').onchange=()=>document.querySelector('output').textContent='42%'</script>`,
  operations: `<h1>Runtime check</h1><button>Run check</button><pre>Idle</pre><script>document.querySelector('button').onclick=()=>document.querySelector('pre').textContent='Check passed\n3 targets healthy'</script>`,
  mobile: `<h1>Quick capture</h1><button>Add entry</button><output>Empty</output><script>document.querySelector('button').onclick=()=>document.querySelector('output').textContent='Entry added'</script>`,
  'route-only': `<h1>Route catalog</h1><nav><a href="/route-only/overview">Overview</a><a href="/route-only/activity">Activity</a></nav>`,
  intake: `<h1>Intake</h1><section></section><script>const steps=[{q:'Any new symptoms?',a:['Reports weakness','No new symptoms']},{q:'Any changes since yesterday?',a:['None reported','Reports vision changes']},{q:'Anything else?',a:['Reports weakness','Nothing further']}];let index=0;const section=document.querySelector('section');const draw=()=>{if(index>=steps.length){section.innerHTML='<output>Assessment complete</output>';return}const step=steps[index];section.innerHTML='<p>'+step.q+'</p>'+step.a.map((label)=>'<button>'+label+'</button>').join('');section.querySelectorAll('button').forEach((button)=>button.onclick=()=>{index+=1;draw()})};draw()</script>`,
  streaming: `<h1>Assistant</h1><label>Message<input aria-label="Message"></label><button>Send</button><output>Idle</output><ul></ul><script>const o=document.querySelector('output'),i=document.querySelector('input'),u=document.querySelector('ul');setInterval(()=>fetch('/api/ping'),300);document.querySelector('button').onclick=()=>{const text=i.value;i.disabled=true;o.textContent='Streaming';setTimeout(()=>{const li=document.createElement('li');li.textContent=text;u.append(li);o.textContent='Stream complete';i.disabled=false;i.value=''},600)}</script>`
};

const shell = (body: string) => `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;max-width:720px;margin:60px auto;padding:24px}button,select{font:inherit;padding:12px;margin:12px}output,pre{display:block;padding:24px;background:#eef4ff}</style><body>${body}</body></html>`;

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') { response.end('ok'); return; }
  if (url.pathname === '/api/reset') { state.clear(); response.end('ok'); return; }
  if (url.pathname === '/api/ping') { response.end('pong'); return; }
  if (url.pathname === '/api/handoff') {
    if (request.method === 'POST') { state.set('handoff', 'Item received'); response.end('Item sent'); return; }
    response.end(state.get('handoff') ?? 'Inbox empty'); return;
  }
  const key = url.pathname.split('/').filter(Boolean)[0] ?? 'stateful';
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(shell(pages[key] ?? pages.stateful));
}).listen(Number(process.env.PORT ?? 4173), '127.0.0.1');

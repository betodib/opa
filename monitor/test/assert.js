const fs = require('fs');
const msgs = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse);
const state = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const wa = msgs.filter((m) => m.ch === 'whatsapp'), em = msgs.filter((m) => m.ch === 'email'), nt = msgs.filter((m) => m.ch === 'ntfy');
console.log(`Recebidos: WhatsApp ${wa.length}, e-mail ${em.length}, ntfy ${nt.length}\n`);
for (const m of wa) console.log(`[${m.t}s fase ${m.phase}] ${m.text.split('\n').slice(0, 3).join(' | ')}`);
const has = (re, list = wa) => list.some((m) => re.test(m.text || m.title || ''));
const checks = [
  ['WhatsApp: aviso de vigia ligado', has(/Vigia ligado/)],
  ['Base: NÃO alerta pelo sitemap antigo (paris)', !wa.some((m) => /paris/.test(m.text) && !/Vigia ligado/.test(m.text))],
  ['Base: NÃO alerta pela notícia já existente', !wa.some((m) => /Notícia nova/.test(m.text) && m.phase < 2)],
  ['Fase 1: link novo na home da On', has(/Links NOVOS sobre o evento[\s\S]*clubhouse-nights/)],
  ['Fase 1: chute 404 virou página (passou a existir)', has(/passou a existir/)],
  ['Fase 1: sitemap ganhou URL do evento', has(/sitemap ganhou[\s\S]*clubhouse-nights-sao-paulo/)],
  ['Fase 2: CRÍTICO, termos de resgate', has(/PARECE QUE ABRIU[\s\S]*resgatar/i)],
  ['Fase 2: Sympla com resultado do evento', has(/Sympla[\s\S]*Links NOVOS/)],
  ['Fase 2: notícia sobre resgate', has(/RESGATE dos ingressos/)],
  ['Fase 3: esgotado detectado', has(/ESGOTADO/)],
  ['Redirecionamento p/ home não conta como página nova', !wa.some((m) => /events[\s\S]*passou a existir/.test(m.text) || /redireciona[\s\S]*passou a existir/.test(m.text))],
  ['Nenhum alerta antes da fase 1 além do "ligado"', wa.filter((m) => m.phase === 0 && !/Vigia ligado/.test(m.text)).length === 0],
  ['E-mail recebeu alertas', em.length >= 5],
  ['ntfy recebeu alertas', nt.length >= 5],
  ['Página descoberta passou a ser vigiada', state.followed.some((f) => /clubhouse-nights-sao-paulo/.test(f.url))],
];
let fail = 0;
console.log('');
for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) fail++; }
process.exit(fail ? 1 : 0);

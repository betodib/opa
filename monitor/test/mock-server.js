// Servidor simulado: imita o site da On, a busca da Sympla, o sitemap e as notícias,
// avançando de "fase" com o tempo. Também recebe WhatsApp (CallMeBot), ntfy e e-mail (SMTP).
const http = require('http');
const fs = require('fs');
const { SMTPServer } = require('smtp-server');
const PORT = Number(process.env.MOCK_PORT || 8787), SMTP_PORT = Number(process.env.MOCK_SMTP_PORT || 2526);
const PHASE_S = Number(process.env.PHASE_S || 15);
const OUT = process.env.MOCK_OUT || 'received.jsonl';
const t0 = Date.now();
const phase = () => Math.floor((Date.now() - t0) / 1000 / PHASE_S);
const rec = (o) => fs.appendFileSync(OUT, JSON.stringify({ t: ((Date.now() - t0) / 1000).toFixed(1), phase: phase(), ...o }) + '\n');
const html = (body, title = 'On') => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`); const ph = phase();
  const send = (code, body, type = 'text/html; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
  if (u.pathname === '/callmebot') { rec({ ch: 'whatsapp', phone: u.searchParams.get('phone'), text: u.searchParams.get('text') }); return send(200, 'Message queued. You will receive it in a few seconds.'); }
  if (u.pathname.startsWith('/ntfy/')) { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { rec({ ch: 'ntfy', title: req.headers.title, priority: req.headers.priority, text: b }); send(200, '{}'); }); return; }
  if (u.pathname === '/on/pt-br') return send(200, html(`<h1>On</h1><a href="/on/pt-br/shoes">Tênis</a><button>Sign up</button>` +
    (ph >= 1 ? `<a href="/on/pt-br/clubhouse-nights">On Clubhouse Nights com Roger Federer</a>` : '')));
  if (u.pathname === '/on/pt-br/events') { res.writeHead(302, { Location: '/on/pt-br' }); return res.end(); }
  if (u.pathname === '/on/pt-br/clubhouse-nights') {
    if (ph < 1) return send(404, html('Página não encontrada', '404'));
    if (ph === 1) return send(200, html('<h1>On Clubhouse Nights: Federer e João Fonseca</h1><p>Em breve. Resgates a partir das 11h de 23/11.</p>'));
    if (ph === 2) return send(200, html('<h1>On Clubhouse Nights: Federer e João Fonseca</h1><form><input name="email"><input name="cpf"><button type="submit">Resgatar ingresso</button></form>'));
    return send(200, html('<h1>On Clubhouse Nights: Federer e João Fonseca</h1><p>Ingressos ESGOTADOS. Entre na lista de espera.</p>'));
  }
  if (u.pathname === '/on/pt-br/explore/clubhouse-nights-sao-paulo') return send(200, html(`<h1>Clubhouse Nights São Paulo</h1><p>Federer. Versão ${ph}</p>`));
  if (u.pathname === '/sympla') return send(200, html(`<p>Resultados para "federer"</p>` + (ph >= 2 ? `<a href="/sympla/evento/on-clubhouse-nights-federer-fonseca/123">On Clubhouse Nights - Federer e Fonseca</a>` : '<p>Nenhum evento</p>')));
  if (u.pathname === '/sympla/evento/on-clubhouse-nights-federer-fonseca/123') return send(200, html('<h1>On Clubhouse Nights Federer</h1><button>Selecionar ingresso</button>'));
  if (u.pathname === '/robots.txt') return send(200, `User-agent: *\nSitemap: http://127.0.0.1:${PORT}/sitemap-index.xml\n`, 'text/plain');
  if (u.pathname === '/sitemap-index.xml') return send(200, `<?xml version="1.0"?><sitemapindex><sitemap><loc>http://127.0.0.1:${PORT}/sitemap-en-us.xml</loc></sitemap><sitemap><loc>http://127.0.0.1:${PORT}/sitemap-pt-br.xml</loc></sitemap></sitemapindex>`, 'application/xml');
  if (u.pathname === '/sitemap-en-us.xml') return send(200, `<urlset><url><loc>http://127.0.0.1:${PORT}/en-us/clubhouse-nights-paris</loc></url></urlset>`, 'application/xml');
  if (u.pathname === '/sitemap-pt-br.xml') return send(200, `<urlset><url><loc>http://127.0.0.1:${PORT}/on/pt-br/shoes</loc></url>${ph >= 1 ? `<url><loc>http://127.0.0.1:${PORT}/on/pt-br/explore/clubhouse-nights-sao-paulo</loc></url>` : ''}</urlset>`, 'application/xml');
  if (u.pathname === '/rss') {
    const items = [`<item><title>Federer e Fonseca jogam no Pacaembu</title><link>http://news/1</link><guid>1</guid></item>`, `<item><title>Receita de bolo</title><link>http://news/x</link><guid>x</guid></item>`];
    if (ph >= 2) items.push(`<item><title><![CDATA[Ingressos para Federer no Pacaembu liberados: veja como resgatar]]></title><link>http://news/2</link><guid>2</guid></item>`);
    return send(200, `<rss><channel>${items.join('')}</channel></rss>`, 'application/rss+xml');
  }
  send(404, html('not found', '404'));
}).listen(PORT, '127.0.0.1', () => console.log(`mock http :${PORT}`));

new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onAuth: (a, s, cb) => cb(null, { user: a.username }),
  onData(stream, session, cb) { let b = ''; stream.on('data', (c) => (b += c)); stream.on('end', () => { rec({ ch: 'email', to: session.envelope.rcptTo.map((r) => r.address), subject: (b.match(/^Subject: (.*(?:\r?\n\s+.*)*)/m) || [])[1] }); cb(); }); } })
  .listen(SMTP_PORT, '127.0.0.1', () => console.log(`mock smtp :${SMTP_PORT}`));

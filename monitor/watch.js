#!/usr/bin/env node
/**
 * Vigia de ingressos: On Clubhouse Nights (Federer x João Fonseca, Pacaembu, 05/12)
 *
 * Vigia três tipos de fonte e alerta por WhatsApp, e-mail e push:
 *   1. Páginas (navegador real com JS): site da On, URLs prováveis do evento, buscas na Sympla e na Ingresse
 *   2. Sitemaps (via robots.txt): descobre páginas NOVAS do evento assim que o site as publica
 *   3. Notícias (Google News e Bing News): a imprensa costuma publicar o link logo que sai
 * Links relevantes descobertos passam a ser vigiados automaticamente.
 *
 * NÃO faz o resgate: avisa para você resgatar manualmente, com a conta já logada.
 *
 *   node watch.js            vigia continuamente
 *   node watch.js --test     manda uma mensagem de teste em cada canal configurado
 *   node watch.js --once     faz uma única varredura e sai
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* sem .env: usa variáveis do ambiente */ }

const { chromium } = require('playwright');
const { norm, makeMatcher } = require('./lib/match');
const notify = require('./lib/notify');

const cfg = require(process.env.CONFIG_FILE ? path.resolve(process.env.CONFIG_FILE) : './config');
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, 'state.json');
const EXTRA_FILE = process.env.EXTRA_FILE || path.join(__dirname, 'extra-urls.txt');
const LOG_FILE = path.join(path.dirname(STATE_FILE), 'alerts.log');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const args = new Set(process.argv.slice(2));

const isEvent = makeMatcher(cfg.eventTerms);
const isAction = makeMatcher(cfg.actionTerms);
const isSoldOut = makeMatcher(cfg.soldOutTerms);
const isSoon = makeMatcher(cfg.soonTerms);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString('pt-BR', { timeZone: cfg.timezone });
const LV = notify.LEVELS;

// ---------------------------------------------------------------- estado
let state = { pages: {}, sitemaps: {}, rss: {}, followed: [], failures: {} };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch { /* primeira execução */ }
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

async function alert(a) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${a.level}] ${a.title} | ${a.url || ''}\n${a.detail || ''}\n\n`);
  await notify.alert(a);
}

// ---------------------------------------------------------------- utilidades
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const canFollow = (u) => cfg.followDomains.some((d) => { const h = hostOf(u); return h === d || h.endsWith('.' + d); });
const cleanUrl = (u) => { try { const x = new URL(u); x.hash = ''; return x.toString(); } catch { return u; } };
const samePath = (a, b) => {
  try {
    const A = new URL(a), B = new URL(b);
    return A.hostname.replace(/^www\./, '') === B.hostname.replace(/^www\./, '') && A.pathname.replace(/\/+$/, '') === B.pathname.replace(/\/+$/, '');
  } catch { return false; }
};
const newOnes = (cur, prev) => cur.filter((x) => !(prev || []).includes(x));

async function fetchText(url, { timeout = 30000 } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf); // sitemap .gz
  return { status: res.status, text: buf.toString('utf8'), finalUrl: res.url };
}

// Contagem de falhas por fonte: avisa após 5 seguidas e avisa quando a fonte se recupera
async function failure(key, name, err, silent) {
  const n = (state.failures[key] = (state.failures[key] || 0) + 1);
  console.error(`\n[${now()}] erro em ${name}: ${err}`);
  if (n === 5 && !silent) await alert({ level: 'MEDIO', title: `Fonte com erro: ${name}`, detail: `5 falhas seguidas. Último erro: ${err}\nO vigia continua tentando.`, url: key.startsWith('http') ? key : '' });
}
async function success(key, name, silent) {
  if ((state.failures[key] || 0) >= 5 && !silent) await alert({ level: 'INFO', title: `Fonte voltou: ${name}`, channels: ['email'] });
  state.failures[key] = 0;
}

// ---------------------------------------------------------------- navegador
let browser, ctx;
async function ensureBrowser() {
  if (browser?.isConnected()) return;
  browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false', ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: cfg.timezone, userAgent: UA, viewport: { width: 1366, height: 900 } });
}

async function snapshot(url) {
  await ensureBrowser();
  const page = await ctx.newPage();
  try {
    await page.route('**/*', (r) => (['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const data = await page.evaluate(() => ({
      title: document.title || '',
      text: document.body ? document.body.innerText : '',
      links: [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || a.title || '').trim().slice(0, 140) })),
      buttons: [...document.querySelectorAll('button, input[type=submit], input[type=button], [role=button], a[class*=btn], a[class*=button]')]
        .map((b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 300),
      forms: document.querySelectorAll('form, input[type=email], input[name*=cpf i], input[name*=email i]').length,
    }));
    return { status: resp ? resp.status() : 0, finalUrl: page.url(), ...data };
  } finally {
    await page.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- páginas
function allPages() {
  const list = [...cfg.pages];
  try {
    for (const line of fs.readFileSync(EXTRA_FILE, 'utf8').split('\n')) {
      const m = line.trim().match(/^(https?:\/\/\S+)\s*(.*)$/);
      if (m) list.push({ url: m[1], name: m[2] || `Extra: ${m[1]}`, kind: 'event' });
    }
  } catch { /* sem arquivo extra */ }
  for (const f of state.followed) list.push(f);
  const seen = new Set();
  return list.filter((p) => { const k = cleanUrl(p.url); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function follow(url, name, from) {
  url = cleanUrl(url);
  if (!canFollow(url) || state.followed.length >= 30) return false;
  if (allPages().some((p) => cleanUrl(p.url) === url)) return false;
  state.followed.push({ url, name: name || `Descoberta: ${url}`, kind: 'event', from });
  return true;
}

const SOFT404 = /pagina nao encontrada|page not found|nao encontramos|404|not found|ops!/;
const startup = { ok: 0, missing: 0, errors: 0, notes: [] };

async function checkPage(p) {
  const key = cleanUrl(p.url);
  const silent = p.kind === 'guess';
  let s;
  try { s = await snapshot(p.url); } catch (e) { return failure(key, p.name, e.message.split('\n')[0], silent).then(() => { startup.errors++; }); }
  await success(key, p.name, silent);

  const text = `${s.title}\n${s.text}`;
  const redirectedAway = !samePath(p.url, s.finalUrl);
  const exists = s.status >= 200 && s.status < 300 && !redirectedAway && !(SOFT404.test(norm(s.title)) && s.text.length < 4000);
  const ev = isEvent(text);
  const act = ev.length ? isAction(text) : [];
  const btnAct = ev.length ? [...new Set(s.buttons.flatMap((b) => isAction(b)))] : [];
  const sold = ev.length ? isSoldOut(text) : [];
  const soon = ev.length ? isSoon(text) : [];
  const relLinks = [...new Map(s.links
    .filter((l) => /^https?:/.test(l.href) && !samePath(l.href, p.url))
    .filter((l) => { let u; try { u = new URL(l.href); } catch { return false; } return isEvent(`${decodeURIComponent(u.hostname + u.pathname)} ${l.text}`).length > 0; })
    .map((l) => [cleanUrl(l.href), l])).values()];
  const hash = crypto.createHash('sha1').update(norm(s.text).replace(/\d+/g, '#')).digest('hex');

  const prev = state.pages[key];
  const cur = { exists, status: s.status, finalUrl: s.finalUrl, ev, act, btnAct, sold, soon, links: relLinks.map((l) => cleanUrl(l.href)), hash, lastChangeAlert: prev?.lastChangeAlert || 0 };
  const signals = []; let level = -1;
  const raise = (lv, msg) => { signals.push(msg); level = Math.max(level, LV[lv]); };

  if (!prev) {
    // Primeira vez: registra a base. Só alerta se o resgate já parecer aberto
    exists ? startup.ok++ : startup.missing++;
    if (exists && ev.length && (act.length || btnAct.length)) raise('CRITICO', `Já há termos de resgate: ${[...new Set([...act, ...btnAct])].join(', ')}`);
    if (exists && ev.length && p.kind !== 'search') startup.notes.push(`${p.name}: menciona ${ev.join(', ')}`);
    for (const l of relLinks) if (await follow(l.href, `Link em ${p.name}: ${l.text || l.href}`.slice(0, 120), p.url)) startup.notes.push(`seguindo ${l.href}`);
  } else {
    if (!prev.exists && exists && p.kind !== 'hub' && p.kind !== 'search') raise('ALTO', `A página passou a existir (HTTP ${s.status})`);
    if (prev.exists && !exists && p.kind === 'event') raise('MEDIO', `A página saiu do ar ou redirecionou (HTTP ${s.status} → ${s.finalUrl})`);
    if (exists) {
      const nAct = newOnes([...new Set([...act, ...btnAct])], [...(prev.act || []), ...(prev.btnAct || [])]);
      if (nAct.length) raise('CRITICO', `Termos de RESGATE apareceram: ${nAct.join(', ')}${btnAct.length ? ` (botões: ${btnAct.join(', ')})` : ''}${s.forms ? `, formulário/campos na página: ${s.forms}` : ''}`);
      const nEv = newOnes(ev, prev.ev);
      if (nEv.length && !(prev.ev || []).length && p.kind !== 'event') raise('ALTO', `A página começou a falar do evento: ${nEv.join(', ')}`);
      const nSold = newOnes(sold, prev.sold);
      if (nSold.length) raise('ALTO', `Aparece ESGOTADO/ENCERRADO: ${nSold.join(', ')}. Fique de olho numa segunda leva`);
      if (ev.length && !nSold.length && (prev.sold || []).length && !sold.length) raise('ALTO', 'O aviso de esgotado SUMIU. Pode ter aberto nova leva!');
      const nSoon = newOnes(soon, prev.soon);
      if (nSoon.length) raise('MEDIO', `Indício de abertura em breve: ${nSoon.join(', ')}`);
      const nLinks = relLinks.filter((l) => !(prev.links || []).includes(cleanUrl(l.href)));
      if (nLinks.length) {
        raise('ALTO', `Links NOVOS sobre o evento:\n${nLinks.slice(0, 8).map((l) => `• ${l.text ? l.text + ': ' : ''}${l.href}`).join('\n')}`);
        for (const l of nLinks) await follow(l.href, `Link em ${p.name}: ${l.text || l.href}`.slice(0, 120), p.url);
      }
      // Páginas do evento: qualquer mudança de conteúdo vale aviso (no máximo 1 a cada 10 min)
      if (!signals.length && p.kind === 'event' && prev.hash && prev.hash !== hash && Date.now() - (prev.lastChangeAlert || 0) > 10 * 60e3) {
        raise('MEDIO', 'O conteúdo da página do evento mudou');
      }
    }
  }
  if (signals.length) cur.lastChangeAlert = Date.now();
  state.pages[key] = cur;
  if (level >= 0) {
    const lvName = Object.keys(LV).find((k) => LV[k] === level);
    await alert({ level: lvName, title: `${lvName === 'CRITICO' ? 'PARECE QUE ABRIU' : lvName === 'ALTO' ? 'Novidade importante' : 'Mudança'}: ${p.name}`, detail: signals.join('\n'), url: s.finalUrl || p.url });
  } else process.stdout.write(exists ? '.' : 'x');
}

// ---------------------------------------------------------------- sitemaps
const locs = (xml) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));

async function checkSitemaps() {
  for (const robots of cfg.robots) {
    const key = `sitemap:${robots}`;
    try {
      let maps = [];
      try {
        const r = await fetchText(robots);
        if (r.status < 400) maps = [...r.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
      } catch { /* sem robots: usa o padrão */ }
      if (!maps.length) maps = [new URL('/sitemap.xml', robots).toString()];

      const found = new Set();
      const queue = [...maps]; let fetched = 0;
      while (queue.length && fetched < cfg.sitemapMaxChildren) {
        const sm = queue.shift(); fetched++;
        const r = await fetchText(sm, { timeout: 45000 });
        if (r.status >= 400) continue;
        const ls = locs(r.text);
        if (/<sitemapindex/i.test(r.text)) {
          const score = (u) => (/pt-br|pt_br/i.test(u) ? 2 : 0) + (cfg.sitemapChildPriority.test(u) ? 1 : 0);
          queue.push(...ls.sort((a, b) => score(b) - score(a)));
        } else ls.filter((u) => cfg.sitemapUrlPattern.test(u)).forEach((u) => found.add(cleanUrl(u)));
      }
      const prev = state.sitemaps[key];
      const cur = [...found];
      if (!prev) {
        if (cur.length) startup.notes.push(`Sitemap ${hostOf(robots)}: ${cur.length} URL(s) já existentes com o padrão (ex.: ${cur.slice(0, 3).join(' , ')})`);
        for (const u of cur) await follow(u, `Sitemap: ${u}`, robots);
      } else {
        const fresh = newOnes(cur, prev);
        if (fresh.length) {
          for (const u of fresh) await follow(u, `Sitemap: ${u}`, robots);
          await alert({ level: 'ALTO', title: `Página nova no site ${hostOf(robots)}`, detail: `O sitemap ganhou URL(s) do evento:\n${fresh.slice(0, 10).map((u) => '• ' + u).join('\n')}\n(já estou vigiando)`, url: fresh[0] });
        }
      }
      state.sitemaps[key] = [...new Set([...(prev || []), ...cur])];
      await success(key, `sitemap ${hostOf(robots)}`);
    } catch (e) { await failure(key, `sitemap ${hostOf(robots)}`, e.message); }
  }
}

// ---------------------------------------------------------------- notícias (RSS)
const tag = (block, t) => { const m = block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;|&gt;/g, '').trim() : ''; };

async function checkRss() {
  for (const f of cfg.rss) {
    const key = `rss:${f.url}`;
    try {
      const r = await fetchText(f.url);
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      const items = [...r.text.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => {
        const b = m[0];
        return { title: tag(b, 'title'), link: tag(b, 'link'), id: tag(b, 'guid') || tag(b, 'link'), desc: tag(b, 'description'), src: tag(b, 'source') };
      }).filter((i) => isEvent(`${i.title} ${i.desc}`).length);
      const prev = state.rss[key];
      if (prev) {
        const fresh = items.filter((i) => !prev.includes(i.id));
        if (fresh.length) {
          const hot = fresh.filter((i) => isAction(`${i.title} ${i.desc}`).length || /link|liberad|abert|esgot|resgat|como pegar|como garantir|como retirar/.test(norm(i.title)));
          await alert({
            level: hot.length ? 'ALTO' : 'MEDIO',
            title: hot.length ? 'Notícia nova sobre RESGATE dos ingressos' : 'Notícia nova sobre o evento',
            detail: fresh.slice(0, 6).map((i) => `• ${i.title}${i.src ? ` (${i.src})` : ''}\n  ${i.link}`).join('\n'),
            url: (hot[0] || fresh[0]).link,
          });
        }
      }
      state.rss[key] = [...new Set([...(prev || []), ...items.map((i) => i.id)])].slice(-500);
      await success(key, f.name);
    } catch (e) { await failure(key, f.name, e.message); }
  }
}

// ---------------------------------------------------------------- agenda
function inFastWindow() {
  const fw = cfg.fastWindow; if (!fw) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const d = `${parts.year}-${parts.month}-${parts.day}`, t = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
  return d === fw.date && t >= fw.from && t <= fw.to;
}

async function pagesCycle() {
  const pages = allPages();
  const conc = Number(process.env.PAGE_CONCURRENCY || 2);
  for (let i = 0; i < pages.length; i += conc) {
    await Promise.all(pages.slice(i, i + conc).map((p) => checkPage(p).catch((e) => console.error('erro interno', e))));
  }
  saveState();
}

async function main() {
  if (args.has('--test')) {
    console.log(notify.channelsSummary());
    await notify.alert({ level: 'CRITICO', title: 'TESTE do vigia Federer', detail: 'Se você recebeu isso, este canal está funcionando ✅', url: 'https://www.on.com/pt-br', channels: ['whatsapp', 'email', 'ntfy'] });
    console.log('Teste enviado. Confira o WhatsApp, o e-mail (inclusive o spam) e o ntfy.');
    return;
  }
  if (!notify.whatsappEnabled() && !notify.emailEnabled()) console.warn('⚠️  Nenhum canal configurado (WhatsApp/e-mail). Copie .env.example para .env e preencha.');

  console.log(`Vigia Federer: ${allPages().length} páginas, ${cfg.robots.length} sitemaps, ${cfg.rss.length} feeds\n${notify.channelsSummary()}\nPrimeira varredura (base)...`);
  await Promise.all([pagesCycle(), checkSitemaps(), checkRss()]);
  saveState();
  await alert({
    level: 'INFO', title: 'Vigia ligado ✅', channels: ['whatsapp', 'email', 'ntfy'],
    detail: `Vigiando ${allPages().length} páginas, ${cfg.robots.length} sitemaps e ${cfg.rss.length} feeds de notícia.\nPáginas no ar: ${startup.ok} | ainda não existem: ${startup.missing} | com erro: ${startup.errors}` +
      (startup.notes.length ? `\nObservações:\n${startup.notes.slice(0, 12).map((n) => '• ' + n).join('\n')}` : ''),
  });
  if (args.has('--once')) { await Promise.race([browser?.close(), sleep(5000)]); return; }

  let lastPages = Date.now(), lastSitemap = Date.now(), lastRss = Date.now(), lastBeat = Date.now(), fastAnnounced = false;
  const t0 = Date.now();
  for (;;) {
    await sleep(Number(process.env.TICK_MS || 3000));
    if (process.env.MAX_RUNTIME_S && Date.now() - t0 > Number(process.env.MAX_RUNTIME_S) * 1000) { saveState(); await Promise.race([browser?.close(), sleep(5000)]); return; }
    const fast = inFastWindow();
    if (fast && !fastAnnounced) {
      fastAnnounced = true;
      await alert({ level: 'INFO', title: 'Hoje é o dia! Vigia em modo rápido ⚡', detail: `Checando páginas a cada ${cfg.fastPageIntervalS}s. Fique de olho nos stories da @on.brasil também.`, channels: ['whatsapp', 'email', 'ntfy'] });
    }
    const pageInt = (fast ? cfg.fastPageIntervalS : cfg.pageIntervalS) * 1000;
    try {
      if (Date.now() - lastPages >= pageInt) { lastPages = Date.now() + Math.random() * 4000; await pagesCycle(); }
      if (Date.now() - lastRss >= cfg.rssIntervalS * 1000) { lastRss = Date.now(); await checkRss(); saveState(); }
      if (Date.now() - lastSitemap >= cfg.sitemapIntervalS * 1000) { lastSitemap = Date.now(); await checkSitemaps(); saveState(); }
      if (Date.now() - lastBeat >= cfg.heartbeatHours * 3600e3) {
        lastBeat = Date.now();
        const failing = Object.entries(state.failures).filter(([, n]) => n >= 5).map(([k]) => k);
        await alert({ level: 'INFO', title: 'Vigia segue ativo 💓', channels: ['email'], detail: `Páginas vigiadas: ${allPages().length} (${state.followed.length} descobertas).${failing.length ? `\nFontes com erro: ${failing.join(', ')}` : ''}` });
      }
    } catch (e) {
      console.error('erro no ciclo:', e.message);
      await browser?.close().catch(() => {}); browser = null;
    }
  }
}

main().then(() => process.exit(0)).catch(async (e) => {
  console.error(e);
  await notify.alert({ level: 'ALTO', title: 'Vigia CAIU ❌', detail: `Erro: ${e.message}\nReinicie com: node watch.js`, channels: ['whatsapp', 'email', 'ntfy'] }).catch(() => {});
  process.exit(1);
});

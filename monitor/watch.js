#!/usr/bin/env node
/**
 * Vigia de página — avisa no celular quando a página de ingressos mudar
 * ou quando aparecer alguma palavra-chave ("resgatar", "garantir", etc.).
 *
 * NÃO faz o resgate sozinho: o objetivo é te avisar no segundo em que abrir,
 * para você resgatar manualmente na conta que já deixou logada.
 *
 * Uso:
 *   npm i playwright            (uma vez; no seu computador)
 *   npx playwright install chromium
 *   NTFY_TOPIC=um-nome-secreto-aleatorio node monitor/watch.js <url> [<url> ...]
 *
 * Variáveis opcionais:
 *   INTERVAL_S   intervalo entre checagens (padrão 45s; não baixe de 30s)
 *   KEYWORDS     palavras separadas por vírgula (padrão abaixo)
 *   NTFY_TOPIC   tópico do ntfy.sh — instale o app ntfy no celular e assine o mesmo tópico
 */
const { chromium } = require('playwright');
const crypto = require('crypto');

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('Passe ao menos uma URL. Ex.: node monitor/watch.js https://www.on.com/pt-br/...');
  process.exit(1);
}
const INTERVAL = Math.max(30, Number(process.env.INTERVAL_S || 45)) * 1000;
const KEYWORDS = (process.env.KEYWORDS ||
  'resgatar,resgate,garanta,garantir,inscreva,inscrição,inscricao,ingresso disponível,disponível,reservar,rsvp,register,get tickets,sign up')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const TOPIC = process.env.NTFY_TOPIC;

async function notify(title, msg, url) {
  console.log(`\n🔔 ${new Date().toLocaleTimeString('pt-BR')} ${title}\n   ${msg}\n   ${url}\n`);
  process.stdout.write('\x07'); // bip no terminal
  if (!TOPIC) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(TOPIC)}`, {
      method: 'POST',
      body: `${msg}\n${url}`,
      headers: { Title: title, Priority: 'urgent', Tags: 'tennis,rotating_light', Click: url },
    });
  } catch (e) { console.error('Falha ao enviar ntfy:', e.message); }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'pt-BR' });
  const state = new Map(); // url -> { hash, hits }

  async function check(url) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000); // deixa o JS da página renderizar
      const text = (await page.innerText('body')).replace(/\s+/g, ' ').trim();
      const lower = text.toLowerCase();
      const hash = crypto.createHash('sha1').update(text).digest('hex');
      const hits = KEYWORDS.filter(k => lower.includes(k));
      const prev = state.get(url);
      if (!prev) {
        console.log(`[base] ${url}\n       palavras já presentes: ${hits.join(', ') || '(nenhuma)'}`);
      } else {
        const newHits = hits.filter(k => !prev.hits.includes(k));
        if (newHits.length) await notify('Federer: palavra nova na página!', `Apareceu: ${newHits.join(', ')}`, url);
        else if (hash !== prev.hash) await notify('Federer: a página mudou', 'Confira agora', url);
        else process.stdout.write('.');
      }
      state.set(url, { hash, hits });
    } catch (e) {
      console.error(`\n[erro] ${url}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await notify('Vigia ligado', `Monitorando ${urls.length} página(s) a cada ${INTERVAL / 1000}s`, urls[0]);
  for (;;) {
    for (const u of urls) await check(u);
    await new Promise(r => setTimeout(r, INTERVAL + Math.random() * 5000));
  }
})();

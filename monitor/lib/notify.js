// Envio de alertas: WhatsApp (CallMeBot ou Twilio), e-mail (SMTP) e push (ntfy).
const nodemailer = require('nodemailer');

const env = process.env;
const LEVELS = { CRITICO: 3, ALTO: 2, MEDIO: 1, INFO: 0 };
const EMOJI = { CRITICO: '🚨', ALTO: '⚠️', MEDIO: '🔎', INFO: 'ℹ️' };

// Nível mínimo para cada canal (configurável no .env)
const minLevel = (name, def) => LEVELS[(env[name] || def).toUpperCase()] ?? LEVELS[def];
const MIN = {
  whatsapp: minLevel('WHATSAPP_MIN_LEVEL', 'ALTO'),
  email: minLevel('EMAIL_MIN_LEVEL', 'MEDIO'),
  ntfy: minLevel('NTFY_MIN_LEVEL', 'MEDIO'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(1500 * 2 ** i); }
  }
  throw last;
}
async function ok(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

// ---------------- WhatsApp ----------------
// CallMeBot: WHATSAPP_TO="+5511999998888:APIKEY,+5511988887777:APIKEY2"
function callmebotTargets() {
  return (env.WHATSAPP_TO || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.lastIndexOf(':');
    return { phone: s.slice(0, i).trim(), apikey: s.slice(i + 1).trim() };
  }).filter((t) => t.phone && t.apikey);
}
const CALLMEBOT_URL = env.CALLMEBOT_URL || 'https://api.callmebot.com/whatsapp.php';

let waQueue = Promise.resolve();
let waLast = 0;
function whatsappSend(text) {
  // Fila serial com intervalo mínimo: o CallMeBot recusa mensagens em rajada
  waQueue = waQueue.then(async () => {
    const gap = Number(env.WHATSAPP_MIN_GAP_S || 8) * 1000;
    const wait = waLast + gap - Date.now();
    if (wait > 0) await sleep(wait);
    const results = [];
    for (const t of callmebotTargets()) {
      const u = `${CALLMEBOT_URL}?phone=${encodeURIComponent(t.phone)}&text=${encodeURIComponent(text.slice(0, 1500))}&apikey=${encodeURIComponent(t.apikey)}`;
      results.push(retry(async () => {
        const res = await ok(await fetch(u, { signal: AbortSignal.timeout(30000) }));
        const body = await res.text();
        if (/error|invalid|not\s+allowed/i.test(body) && !/queued|sent|success/i.test(body)) throw new Error(body.slice(0, 200));
      }).catch((e) => console.error(`[whatsapp ${t.phone}] falhou: ${e.message}`)));
    }
    if (env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM && env.TWILIO_TO) {
      for (const to of env.TWILIO_TO.split(',').map((s) => s.trim()).filter(Boolean)) {
        results.push(retry(async () => {
          await ok(await fetch(`${env.TWILIO_URL || 'https://api.twilio.com'}/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ From: env.TWILIO_FROM, To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`, Body: text.slice(0, 1500) }),
            signal: AbortSignal.timeout(30000),
          }));
        }).catch((e) => console.error(`[twilio ${to}] falhou: ${e.message}`)));
      }
    }
    await Promise.all(results);
    waLast = Date.now();
  });
  return waQueue;
}
const whatsappEnabled = () => callmebotTargets().length > 0 || !!(env.TWILIO_SID && env.TWILIO_TO);

// ---------------- E-mail ----------------
let transporter;
function mailer() {
  if (transporter) return transporter;
  if (env.EMAIL_TRANSPORT === 'json') transporter = nodemailer.createTransport({ jsonTransport: true });
  else transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT || 465),
    secure: (env.SMTP_SECURE ?? (String(env.SMTP_PORT || 465) === '465' ? 'true' : 'false')) === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    tls: env.SMTP_INSECURE_TLS === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  return transporter;
}
const emailEnabled = () => !!env.EMAIL_TO && (!!env.SMTP_USER || env.EMAIL_TRANSPORT === 'json' || !!env.SMTP_HOST);
function emailSend(subject, text) {
  return retry(() => mailer().sendMail({
    from: env.EMAIL_FROM || env.SMTP_USER || 'vigia@localhost',
    to: env.EMAIL_TO,
    subject,
    text,
    priority: /🚨/.test(subject) ? 'high' : 'normal',
  })).catch((e) => console.error(`[email] falhou: ${e.message}`));
}

// ---------------- ntfy (push no celular, opcional) ----------------
const ntfyEnabled = () => !!env.NTFY_TOPIC;
function ntfySend(level, title, text, url) {
  // Cabeçalhos HTTP precisam ser ASCII: o título vai sem acentos e sem emoji
  const ascii = (s) => s.normalize('NFD').replace(/[^\x20-\x7e]/g, '').trim();
  return retry(async () => ok(await fetch(`${env.NTFY_URL || 'https://ntfy.sh'}/${encodeURIComponent(env.NTFY_TOPIC)}`, {
    method: 'POST',
    body: text,
    headers: {
      Title: ascii(title) || 'Vigia Federer',
      Priority: level === 'CRITICO' ? 'urgent' : level === 'ALTO' ? 'high' : 'default',
      Tags: level === 'CRITICO' ? 'rotating_light,tennis' : 'tennis',
      ...(url ? { Click: url } : {}),
    },
    signal: AbortSignal.timeout(20000),
  }))).catch((e) => console.error(`[ntfy] falhou: ${e.message}`));
}

// ---------------- API ----------------
const fmtTime = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** alert({ level, title, detail, url, force }): envia para os canais conforme o nível */
async function alert({ level = 'MEDIO', title, detail = '', url = '', channels }) {
  const lv = LEVELS[level] ?? 1;
  const head = `${EMOJI[level] || ''} ${title}`.trim();
  const body = [detail, url && `👉 ${url}`, `(${fmtTime()})`].filter(Boolean).join('\n');
  console.log(`\n${head}\n${body.replace(/^/gm, '   ')}\n`);
  if (lv >= LEVELS.ALTO) process.stdout.write('\x07');
  // Com `channels` explícito, envia nesses canais independentemente do nível mínimo
  const want = (c) => (channels ? channels.includes(c) : lv >= MIN[c]);
  const jobs = [];
  if (want('whatsapp') && whatsappEnabled()) jobs.push(whatsappSend(`*${head}*\n${body}`));
  if (want('email') && emailEnabled()) jobs.push(emailSend(`[Vigia Federer] ${head}`, body));
  if (want('ntfy') && ntfyEnabled()) jobs.push(ntfySend(level, head, body, url));
  await Promise.all(jobs);
}

function channelsSummary() {
  return [
    `WhatsApp: ${whatsappEnabled() ? `ativo (${callmebotTargets().length} número(s) CallMeBot${env.TWILIO_SID ? ' + Twilio' : ''}), nível mínimo ${Object.keys(LEVELS).find((k) => LEVELS[k] === MIN.whatsapp)}` : 'DESLIGADO'}`,
    `E-mail: ${emailEnabled() ? `ativo (${env.EMAIL_TO}), nível mínimo ${Object.keys(LEVELS).find((k) => LEVELS[k] === MIN.email)}` : 'DESLIGADO'}`,
    `Push ntfy: ${ntfyEnabled() ? 'ativo' : 'desligado (opcional)'}`,
  ].join('\n');
}

module.exports = { alert, channelsSummary, whatsappEnabled, emailEnabled, LEVELS };

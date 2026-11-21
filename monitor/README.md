# Vigia de ingressos: Federer x Fonseca (On Clubhouse Nights)

Avisa por **WhatsApp**, **e-mail** e **push** (ntfy) no momento em que os ingressos aparecerem. **Não faz o resgate**: você resgata manualmente, com a conta já logada.

## O que ele vigia
| Fonte | Como | Quando alerta |
|---|---|---|
| Site da On (home, Explore) | navegador real, com JavaScript | surge menção ao evento, **link novo** do evento, termos de resgate |
| URLs prováveis do evento (On e Ingresse) | idem | a página **passa a existir** (404 → 200, ignorando redirecionamento para a home) |
| Busca na Sympla ("federer", "clubhouse nights") | idem | aparece um evento correspondente |
| Sitemaps de on.com e ingresse.com (pelo robots.txt) | XML | o site **publica uma URL nova** com federer/fonseca/clubhouse, às vezes antes de divulgar |
| Google News e Bing News | RSS | notícia nova; vira ALTO se falar em link/resgate/liberado/esgotado |
| Seus links (`extra-urls.txt`) | navegador | qualquer mudança (no máximo 1 aviso a cada 10 min por página) |

Todo link relevante descoberto (na home, na busca ou no sitemap) **passa a ser vigiado automaticamente**.

**Níveis de alerta:**
- 🚨 **CRITICO:** termos ou botões de resgate ("resgatar", "garanta", "selecionar ingresso", "sorteio"...) numa página do evento. **Corra.**
- ⚠️ **ALTO:** página nova, link novo, notícia sobre o resgate, esgotado, ou o "esgotado" sumiu (nova leva).
- 🔎 **MEDIO:** "em breve"/horário de abertura, conteúdo de página do evento mudou, fonte com erro.
- ℹ️ **INFO:** vigia ligado, modo rápido no dia 23, "estou vivo" por e-mail a cada 6 h.

Na primeira varredura ele **registra a base** e não alerta pelo que já existia. Só alerta de cara se o resgate já parecer aberto. O ritmo é de 60 s por página, **30 s em 23/11 a partir das 6h**, 4 min para notícias e 10 min para sitemaps. O estado fica salvo em `state.json`, então ao reiniciar ele não repete alertas.

## Instalação (no seu computador, que precisa ficar ligado)
```bash
cd monitor
npm install
npx playwright install chromium
cp .env.example .env      # e preencha (veja abaixo)
npm run test-alerts       # manda um TESTE em cada canal
npm start                 # liga o vigia (deixe a janela aberta)
```

### WhatsApp (CallMeBot, grátis)
1. Abra https://www.callmebot.com/blog/free-api-whatsapp-messages/ e pegue o **número atual do bot**.
2. Salve o número nos contatos e mande pelo WhatsApp: `I allow callmebot to send me messages`.
3. Você recebe uma **APIKEY**. No `.env`: `WHATSAPP_TO=+5511XXXXXXXXX:APIKEY`. Para mais de um número, separe por vírgula. Cada pessoa precisa fazer o passo 2 com o próprio número.

O CallMeBot é um serviço gratuito de terceiros e pode atrasar ou cair. Por isso o e-mail e o ntfy ficam de reserva. Para redundância paga e mais estável, dá para preencher também as variáveis `TWILIO_*`.

### E-mail (Gmail)
1. Ative a verificação em 2 etapas na conta Google.
2. Gere uma **senha de app** em https://myaccount.google.com/apppasswords.
3. No `.env`: `SMTP_USER=seu@gmail.com`, `SMTP_PASS=<senha de app>`, `EMAIL_TO=seu@gmail.com`. Pode ter vários destinatários, separados por vírgula.
4. Marque o remetente como "não é spam" depois do teste.

### Push (ntfy, opcional e o aviso mais rápido)
Instale o app **ntfy**, assine um tópico com nome difícil (ex.: `federer-x7k2q9`) e coloque o mesmo nome em `NTFY_TOPIC`.

## Durante a espera
- **Desative a suspensão do computador.** No Mac, `caffeinate -i npm start` resolve. No Windows, ajuste em Energia.
- Achou um link oficial (bio ou stories da @on.brasil)? **Cole em `extra-urls.txt`**. O vigia pega no próximo ciclo, sem reiniciar.
- Chegou alerta "Fonte com erro" de on.com? O site pode estar barrando robôs. Tente `HEADLESS=false` no `.env` para abrir o navegador visível.
- Tudo o que foi alertado fica em `alerts.log`.
- O Instagram não dá para vigiar por script. Para ele, use as notificações do próprio app.

## Ajustes
Termos, URLs e ritmos ficam em `config.js`. Os níveis mínimos por canal ficam no `.env` (`WHATSAPP_MIN_LEVEL`, `EMAIL_MIN_LEVEL`, `NTFY_MIN_LEVEL`).

## Teste automático
`npm test` sobe um servidor que simula a On, a Sympla, o sitemap e as notícias passando por quatro fases: nada → página e link aparecem → resgate aberto → esgotado. Ele confere 15 comportamentos, inclusive o recebimento de WhatsApp, e-mail e push (tudo local, nada é enviado de verdade).

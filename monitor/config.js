// =====================================================================
// Configuração do vigia: o que vigiar e o que conta como relevante.
// Você pode editar à vontade. URLs extras sem reiniciar: extra-urls.txt
// =====================================================================

module.exports = {
  // Termos que indicam que um texto ou link é sobre ESTE evento
  eventTerms: ['federer', 'joao fonseca', 'clubhouse nights', 'on clubhouse', 'clubhouse'],

  // Termos de AÇÃO: o resgate/inscrição está aberto
  actionTerms: [
    'resgatar', 'resgate seu', 'resgate agora', 'resgate o seu', 'garanta seu', 'garanta o seu', 'garantir ingresso',
    'garantir meu', 'inscreva-se', 'inscricoes abertas', 'inscricao aberta', 'faca sua inscricao', 'retire seu',
    'retirar ingresso', 'retirar meu', 'reservar', 'reserve seu', 'rsvp', 'get tickets', 'get your ticket',
    'claim your', 'claim ticket', 'participe do sorteio', 'sorteio', 'fila virtual', 'ingressos disponiveis',
    'ingresso disponivel', 'selecionar ingresso', 'comprar ingresso', 'adquirir ingresso', 'quero meu ingresso',
  ],

  // Termos de ESGOTADO/ENCERRADO (útil para saber quando abre segunda leva)
  soldOutTerms: [
    'esgotado', 'esgotados', 'sold out', 'inscricoes encerradas', 'resgate encerrado', 'lista de espera',
    'waitlist', 'indisponivel', 'vendas encerradas', 'nao ha ingressos',
  ],

  // Termos que indicam que o resgate abre em breve ou já tem data
  soonTerms: ['em breve', 'a partir das', 'abre as', 'abertura dos resgates', 'liberacao', 'contagem regressiva', 'coming soon'],

  // Domínios em que links relevantes descobertos são seguidos automaticamente
  followDomains: [
    'on.com', 'on-running.com', 'ingresse.com', 'sympla.com.br', 'eventim.com.br', 'ticketmaster.com.br',
    'shotgun.live', 'eventbrite.com.br', 'eventbrite.com', 'lu.ma', 'linktr.ee', 'bileto.sympla.com.br',
    'zigpay.com.br', 'q2ingressos.com.br', 'ticket360.com.br', 'uhuu.com', 'blueticket.com.br',
    'mercadolivrearenapacaembu.com.br', 'typeform.com', 'forms.gle', 'docs.google.com',
  ],

  // ---------- Páginas (abertas num navegador de verdade, com JavaScript) ----------
  // kind: hub    = página que existe; alerta se surgir menção ou link do evento
  //       guess  = URL "chutada" que talvez passe a existir (404 -> 200 gera alerta). Erros são silenciosos
  //       search = busca em plataforma de ingressos; alerta se surgir resultado com o evento
  //       event  = página do evento; QUALQUER mudança gera alerta
  pages: [
    { name: 'On Brasil (home)', url: 'https://www.on.com/pt-br', kind: 'hub' },
    { name: 'On Brasil: Explore', url: 'https://www.on.com/pt-br/explore', kind: 'hub' },
    { name: 'On: eventos (pt-br)', url: 'https://www.on.com/pt-br/events', kind: 'guess' },
    { name: 'On: clubhouse-nights', url: 'https://www.on.com/pt-br/clubhouse-nights', kind: 'guess' },
    { name: 'On: explore/clubhouse-nights', url: 'https://www.on.com/pt-br/explore/clubhouse-nights', kind: 'guess' },
    { name: 'On: stories/clubhouse-nights', url: 'https://www.on.com/pt-br/stories/clubhouse-nights', kind: 'guess' },
    { name: 'On: clubhouse', url: 'https://www.on.com/pt-br/clubhouse', kind: 'guess' },
    { name: 'On: tennis', url: 'https://www.on.com/pt-br/explore/tennis', kind: 'guess' },
    { name: 'On events (global)', url: 'https://www.on.com/en-us/events', kind: 'guess' },
    { name: 'Sympla: busca federer', url: 'https://www.sympla.com.br/eventos?s=federer', kind: 'search' },
    { name: 'Sympla: busca clubhouse', url: 'https://www.sympla.com.br/eventos?s=clubhouse%20nights', kind: 'search' },
    { name: 'Ingresse: on-clubhouse-nights', url: 'https://www.ingresse.com/on-clubhouse-nights', kind: 'guess' },
    { name: 'Ingresse: on-clubhouse-nights-sao-paulo', url: 'https://www.ingresse.com/on-clubhouse-nights-sao-paulo', kind: 'guess' },
    { name: 'Ingresse: on-clubhouse-nights-2026', url: 'https://www.ingresse.com/on-clubhouse-nights-2026', kind: 'guess' },
    { name: 'Esportividade (agenda do evento)', url: 'https://esportividade.com.br/evento/on-clubhouse-nights-2026-roger-federer-e-joao-fonseca-sao-paulo/', kind: 'event' },
  ],

  // ---------- Sitemaps (descobre páginas NOVAS assim que o site as publica) ----------
  // Lê os "Sitemap:" listados no robots.txt e procura URLs novas com os padrões abaixo
  robots: ['https://www.on.com/robots.txt', 'https://www.ingresse.com/robots.txt'],
  sitemapUrlPattern: /federer|fonseca|clubhouse/i,
  sitemapChildPriority: /pt-br|pt_br|br|event|evento|page|explore|stories/i,
  sitemapMaxChildren: 40,

  // ---------- Notícias (a imprensa costuma publicar o link minutos depois) ----------
  rss: [
    { name: 'Google News: On Clubhouse Nights', url: 'https://news.google.com/rss/search?q=%22Clubhouse+Nights%22+Federer&hl=pt-BR&gl=BR&ceid=BR:pt-419' },
    { name: 'Google News: Federer ingressos Pacaembu', url: 'https://news.google.com/rss/search?q=Federer+Fonseca+ingressos+Pacaembu&hl=pt-BR&gl=BR&ceid=BR:pt-419' },
    { name: 'Bing News: Federer Pacaembu', url: 'https://www.bing.com/news/search?q=Federer+Fonseca+Pacaembu+ingressos&format=rss&setlang=pt-BR' },
  ],

  // ---------- Ritmo (em segundos) ----------
  pageIntervalS: 60,          // ritmo normal das páginas
  fastPageIntervalS: 30,      // ritmo na janela rápida
  fastWindow: { date: '2026-11-23', from: '06:00', to: '23:59' }, // horário de Brasília
  sitemapIntervalS: 600,
  rssIntervalS: 240,
  heartbeatHours: 6,          // e-mail de "estou vivo"
  timezone: 'America/Sao_Paulo',
};

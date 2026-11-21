// Configuração de teste: tudo aponta para o servidor simulado (test/mock-server.js)
const base = require('../config');
const H = `http://127.0.0.1:${process.env.MOCK_PORT || 8787}`;
module.exports = {
  ...base,
  followDomains: [...base.followDomains, '127.0.0.1'],
  pages: [
    { name: 'On (home simulada)', url: `${H}/on/pt-br`, kind: 'hub' },
    { name: 'On: clubhouse-nights (chute)', url: `${H}/on/pt-br/clubhouse-nights`, kind: 'guess' },
    { name: 'Chute que redireciona p/ home', url: `${H}/on/pt-br/events`, kind: 'guess' },
    { name: 'Sympla busca', url: `${H}/sympla?s=federer`, kind: 'search' },
  ],
  robots: [`${H}/robots.txt`],
  rss: [{ name: 'News simulado', url: `${H}/rss` }],
  pageIntervalS: 2, fastPageIntervalS: 2, fastWindow: null,
  sitemapIntervalS: 3, rssIntervalS: 3, heartbeatHours: 1000,
};

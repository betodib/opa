// Normalização de texto e critérios de relevância.
const norm = (s = '') =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function makeMatcher(terms) {
  const list = terms.map(norm).filter(Boolean);
  return (text) => {
    const t = norm(text);
    return list.filter((k) => t.includes(k));
  };
}

module.exports = { norm, makeMatcher };

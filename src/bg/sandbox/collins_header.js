/* global api */
async function fetchCollinsHeader(expression) {
    const html = await api.fetch('https://dict.youdao.com/w/' + encodeURIComponent(expression));
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Same source selectors as encn_Collins, but never load or select a dictionary.
    const head = doc.querySelector('#collinsResult h4');
    const text = selector => head?.querySelector(selector)?.textContent.trim() || '';
    const word = text('.title');
    if (!word) return null;
    const starClass = head.querySelector('.star')?.className || '';
    const stars = Number(starClass.match(/(?:^|\s)star([0-5])(?:\s|$)/)?.[1] || 0);
    return {
        expression: word,
        reading: text('.phonetic'),
        stars,
        ranks: text('.rank').split(/\s+/).filter(Boolean),
        audios: [1, 2].map(type => `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`)
    };
}

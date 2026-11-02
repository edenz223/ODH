const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { loadClassic } = require('../helpers/load-classic.cjs');

function fixture(html) {
    const dom = new JSDOM();
    const requests = [];
    const fetchHeader = loadClassic('src/bg/sandbox/collins_header.js', 'fetchCollinsHeader', {
        DOMParser: dom.window.DOMParser,
        api: { fetch: async url => { requests.push(url); return html; } }
    });
    return { fetchHeader, requests, close: () => dom.window.close() };
}

test('Collins header extracts the source word, IPA, stars, exam tags and two audio variants', async () => {
    const f = fixture('<div id="collinsResult"><h4><span class="title">hope</span><span class="phonetic">/həʊp/</span><span class="star star5"></span><span class="rank">CET4  TEM4</span></h4></div>');
    try {
        const header = await f.fetchHeader('Hope');
        assert.equal(f.requests[0], 'https://dict.youdao.com/w/Hope');
        assert.equal(header.expression, 'hope');
        assert.equal(header.reading, '/həʊp/');
        assert.equal(header.stars, 5);
        assert.deepEqual(Array.from(header.ranks), ['CET4', 'TEM4']);
        assert.deepEqual(Array.from(header.audios), [
            'https://dict.youdao.com/dictvoice?audio=hope&type=1',
            'https://dict.youdao.com/dictvoice?audio=hope&type=2'
        ]);
        assert.equal(header.definitions, undefined);
    } finally { f.close(); }
});

test('absent Collins metadata yields no invented phonetic, rating or exam labels', async () => {
    for (const html of ['', '<div id="phrsListTab">Youdao concise only</div>']) {
        const f = fixture(html);
        try { assert.equal(await f.fetchHeader('unknown phrase'), null); }
        finally { f.close(); }
    }
    const f = fixture('<div id="collinsResult"><h4><span class="title">word</span></h4></div>');
    try {
        const header = await f.fetchHeader('word');
        assert.equal(header.reading, ''); assert.equal(header.stars, 0); assert.equal(header.ranks.length, 0);
    } finally { f.close(); }
});

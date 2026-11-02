const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { loadClassic } = require('../helpers/load-classic.cjs');

function fixture(fetchImpl = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Meaning\n<script>bad()</script>' } }] }) })) {
    const event = { addListener() {} };
    const messages = [];
    const chrome = { runtime: { onMessage: event, onInstalled: event, onStartup: event, sendMessage: async request => { messages.push(request); return { __odhReply: true, ok: true, value: 'ordinary result' }; } }, tabs: { onCreated: event, onUpdated: event, query: (_, callback) => callback([]) }, commands: { onCommand: event }, action: { setBadgeText() {} }, i18n: { getMessage: () => 'AI query failed' } };
    const exported = loadClassic('src/bg/js/serviceworker.js', '({ prototype: ODHServiceworker.prototype, aiLookup, aiBuildRequest })', {
        chrome, URL, AbortController, setTimeout, clearTimeout, fetch: fetchImpl,
        optionsLoad: async () => ({}), optionsSave: async () => {},
        Ankiconnect: class {}, Builtin: class { loadData() {} }, Deinflector: class { loadData() {} },
        importScripts() {}, setupOffscreenDocument: async () => {}, setInterval() {}, console: { error() {}, warn() {}, info() {} }
    }, null, ['src/lib/envelope.js', 'src/lib/message.js', 'src/lib/marked-18.1.2.umd.js', 'src/bg/js/ai_markdown.js', 'src/bg/js/ai_client.js']);
    const worker = Object.create(exported.prototype);
    worker.optionsReady = Promise.resolve();
    worker.options = { dictSelected: 'ai:test', aiConfigurations: [config()] };
    return { ...exported, worker, messages, chrome };
}
function config(provider = 'openai') {
    return { id: 'test', provider, apiKey: 'synthetic-secret', model: 'test-model', endpoint: 'https://example.test/{model}', system_prompt: 'Tutor {highlight}', user_prompt: 'Term: {highlight}\nContext: {context}' };
}

test('configured AI dictionaries appear without credentials and survive script reload', async () => {
    const { worker } = fixture();
    worker.options.dictNamelist = [{ objectname: 'normal', displayname: 'Normal' }];
    worker.refreshAiDictionaries(worker.options);
    assert.equal(worker.options.dictNamelist.length, 2);
    assert.equal(worker.options.dictNamelist[1].objectname, 'ai:test');
    assert.match(worker.options.dictNamelist[1].displayname, /OpenAI.*test-model/);
    assert.equal(JSON.stringify(worker.options.dictNamelist).includes('synthetic-secret'), false);
    worker.loadScripts = async () => ({ loaded: [{ result: { objectname: 'normal', displayname: 'Normal' } }], failed: [] });
    await worker.setupScripts(worker.options);
    assert.equal(worker.options.dictSelected, 'ai:test');
    const frontend = worker.frontendOptions(worker.options);
    assert.equal(frontend.aiConfigurations, undefined);
    assert.equal(frontend.dictNamelist[1].objectname, 'ai:test');
});

for (const provider of ['openai', 'deepseek', 'gemini']) {
    test(`${provider} query renders selected text and context into the provider request`, async () => {
        let sent;
        const f = fixture(async (url, init) => {
            sent = { url, init, body: JSON.parse(init.body) };
            return { ok: true, json: async () => provider === 'gemini' ? { candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: 'Meaning\n<script>bad()</script>' }] } }] } : { choices: [{ message: { content: 'Meaning\n<script>bad()</script>' } }] } };
        });
        f.worker.options.aiConfigurations = [config(provider)];
        const result = await f.worker.findTerm('word{context}', 'A $& sentence.');
        const system = provider === 'gemini' ? sent.body.systemInstruction.parts[0].text : sent.body.messages[0].content;
        const user = provider === 'gemini' ? sent.body.contents[0].parts[0].text : sent.body.messages[1].content;
        assert.equal(system, 'Tutor word{context}');
        assert.equal(user, 'Term: word{context}\nContext: A $& sentence.');
        assert.match(result, /<div class="odh-markdown">/);
        assert.match(result, /Meaning/);
        assert.match(result, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
        assert.equal(result.includes('<script>'), false);
        assert.equal(sent.init.redirect, 'error');
        assert.equal(sent.url.includes('synthetic-secret'), false);
        assert.equal(f.messages.length, 1);
        assert.equal(f.messages[0].action, 'getCollinsHeader', 'only metadata, not dictionary definitions, is queried');
    });
}

test('ordinary lookup still uses the dictionary sandbox; AI selection gives sandbox a real dictionary', async () => {
    const f = fixture();
    f.worker.options.dictNamelist = [{ objectname: 'normal' }, { objectname: 'ai:test' }];
    await f.worker.setScriptsOptions(f.worker.options);
    assert.equal(f.messages[0].params.options.dictSelected, 'normal');
    assert.equal(f.messages[0].params.options.aiConfigurations, undefined);
    f.worker.options.dictSelected = 'normal';
    assert.equal(await f.worker.findTerm('word', 'Context'), 'ordinary result');
    assert.equal(f.messages[1].action, 'findTerm');
    assert.equal(f.messages[1].params.expression, 'word');
});

test('HTTP failures become visible safe AI errors instead of exposing provider payloads', async () => {
    const f = fixture(async () => ({ ok: false, status: 401, json: async () => ({ error: 'synthetic-secret' }) }));
    let reply;
    await f.worker.frontend_getTranslation({ expression: 'word', context: 'Context', callback: value => { reply = value; } });
    assert.equal(reply.ok, true);
    assert.equal(reply.value, 'AI query failed: HTTP 401');
    assert.equal(reply.value.includes('synthetic-secret'), false);
});

test('removing an AI configuration falls back to an available ordinary dictionary', () => {
    const { worker } = fixture();
    worker.options.aiConfigurations = [];
    worker.options.dictNamelist = [{ objectname: 'normal' }, { objectname: 'ai:test' }];
    worker.refreshAiDictionaries(worker.options);
    assert.equal(worker.options.dictSelected, 'normal');
    assert.equal(worker.options.dictNamelist.length, 1);
});


test('AI cards combine Collins header metadata with AI definitions without selecting a dictionary', async () => {
    const f = fixture();
    f.chrome.runtime.sendMessage = async request => {
        f.messages.push(request);
        return { __odhReply: true, ok: true, value: { expression: 'hope', reading: '/həʊp/', stars: 5, ranks: ['CET4', 'TEM4'], audios: ['https://dict.youdao.com/dictvoice?audio=hope&type=1'] } };
    };
    const result = await f.worker.findTerm('hope', 'I hope so.');
    assert.equal(result[0].expression, 'hope');
    assert.equal(result[0].reading, '/həʊp/');
    assert.match(result[0].extrainfo, /★★★★★/);
    assert.match(result[0].extrainfo, /CET4/);
    assert.match(result[0].extrainfo, /TEM4/);
    assert.equal(result[0].audios.length, 1);
    assert.match(result[0].definitions[0], /Meaning/);
    assert.equal(result[0].sentence, 'I hope so.');
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
    try {
        const realm = dom.getInternalVMContext();
        loadClassic('src/lib/purify-3.4.11.min.js', 'DOMPurify', {}, realm);
        const sanitize = loadClassic('src/lib/sanitize.js', 'sanitizeNote', {}, realm);
        dom.window.document.body.innerHTML = sanitize(result[0]).extrainfo;
        // No frame.css: a copied/exported header must retain the Collins styling.
        const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
        assert.equal(style('.ai-collins-star').color, 'rgb(255, 187, 0)');
        assert.equal(style('.ai-collins-rank').backgroundColor, 'rgb(92, 184, 92)');
        assert.equal(style('.ai-collins-rank').color, 'rgb(255, 255, 255)');
        assert.equal(style('.ai-collins-rank').borderRadius, '3px');
    } finally { dom.window.close(); }
    assert.equal(f.worker.options.dictSelected, 'ai:test');
    assert.equal(f.messages.some(request => request.action === 'setScriptsOptions'), false);
});

test('Collins network failures cannot suppress a successful AI answer', async () => {
    const f = fixture();
    f.chrome.runtime.sendMessage = async () => { throw new Error('metadata offline'); };
    const result = await f.worker.findTerm('hope');
    assert.equal(typeof result, 'string');
    assert.match(result, /Meaning/);
});

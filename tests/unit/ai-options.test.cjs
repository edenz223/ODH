const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

async function fixture(options = {}, fetchImpl) {
    const dom = new JSDOM(fs.readFileSync('src/bg/options.html', 'utf8'), { runScripts: 'outside-only', url: 'https://extension.test' });
    const { window } = dom;
    const writes = [];
    window.chrome = { i18n: { getMessage: key => key }, permissions: { request: async () => true, contains: async () => true } };
    window.populateDictionary = () => {};
    window.optionsLoad = async () => structuredClone(options);
    window.options_api = { optionsChanged: async value => { writes.push(structuredClone(value)); options = value; value.dictNamelist ||= []; return value; } };
    window.fetch = fetchImpl || (async () => ({ ok: true, json: async () => ({ choices: [{}] }) }));
    const dialog = window.document.getElementById('ai-dialog');
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new window.Event('close')); };
    // Wait for jsdom's initial event, then install the actual page script.
    await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    window.eval(fs.readFileSync('src/bg/js/ai_client.js', 'utf8') + '\n' + fs.readFileSync('src/bg/js/ai_options.js', 'utf8'));
    await window.initializeAiOptions();
    const el = id => window.document.getElementById(id);
    const change = (id, value) => { el(id).value = value; el(id).dispatchEvent(new window.Event('change')); };
    return { window, dom, el, change, writes, dialog, tick: () => new Promise(resolve => setImmediate(resolve)) };
}

function selectModel(f) {
    if (!f.el('ai-custom').checked && !f.el('ai-model').value) f.el('ai-model').add(new f.window.Option('test-model', 'test-model', true, true));
}

test('add, select provider, custom model, save, edit and cancel preserve stored settings', async () => {
    const f = await fixture({ enabled: false, legacyField: 'keep' });
    try {
        f.el('ai-add').click();
        assert.equal(f.dialog.open, true);
        assert.equal(f.el('ai-details').hidden, true);
        f.change('ai-provider', 'openai');
        assert.equal(f.el('ai-details').hidden, false);
        assert.equal(f.el('ai-key').type, 'password');
        f.el('ai-key').value = 'synthetic-key';
        f.el('ai-custom').click();
        assert.equal(f.el('ai-model').hidden, true);
        f.el('ai-custom-model').value = 'custom-model';
        selectModel(f); f.el('ai-save').click();
        await f.tick();
        assert.equal(f.dialog.open, false);
        assert.equal(f.writes.length, 1);
        assert.equal(f.writes[0].enabled, false);
        assert.equal(f.writes[0].legacyField, 'keep');
        assert.equal(f.writes[0].aiConfigurations[0].model, 'custom-model');
        assert.equal(f.el('ai-configurations').textContent.includes('synthetic-key'), false);
        f.el('ai-configurations').querySelector('button').click();
        assert.equal(f.el('ai-key').value, 'synthetic-key');
        f.el('ai-key').value = 'unsaved-key';
        f.el('ai-cancel').click();
        assert.equal(f.writes.length, 1);
        assert.equal(f.el('ai-key').value, '');
    } finally { f.dom.window.close(); }
});

test('legacy keys appear as editable configurations and multiple entries survive adding', async () => {
    const f = await fixture({ openaiApiKey: 'old-key', geminiApiKey: 'old-gemini' });
    try {
        assert.equal(f.el('ai-configurations').children.length, 2);
        f.el('ai-add').click();
        f.change('ai-provider', 'deepseek');
        f.el('ai-key').value = 'new-key';
        selectModel(f); f.el('ai-save').click();
        await f.tick();
        assert.equal(f.writes[0].aiConfigurations.length, 3);
        assert.equal(f.writes[0].aiConfigurations[0].apiKey, 'old-key');
        assert.equal(f.writes[0].openaiApiKey, '');
    } finally { f.dom.window.close(); }
});

test('testing uses unsaved Gemini settings and never writes them to storage', async () => {
    let request;
    const f = await fixture({}, async (url, init) => { request = { url, init }; return { ok: true, json: async () => ({ candidates: [{}] }) }; });
    try {
        f.el('ai-add').click(); f.change('ai-provider', 'gemini');
        f.el('ai-key').value = 'test-key';
        selectModel(f); f.el('ai-test').click(); await f.tick();
        assert.equal(request.url.includes(':generateContent'), true);
        assert.equal(request.url.includes('test-key'), false);
        assert.equal(request.init.headers['x-goog-api-key'], 'test-key');
        assert.equal(request.init.redirect, 'error');
        assert.equal(f.el('ai-status').textContent, 'aiTestSuccess');
        assert.equal(f.writes.length, 0);
    } finally { f.dom.window.close(); }
});

test('HTTP errors do not expose provider response bodies or keys', async () => {
    const f = await fixture({}, async () => ({ ok: false, status: 401, json: async () => ({ error: 'synthetic-key' }) }));
    try {
        f.el('ai-add').click(); f.change('ai-provider', 'openai'); f.el('ai-key').value = 'synthetic-key';
        selectModel(f); f.el('ai-test').click(); await f.tick();
        assert.equal(f.el('ai-status').textContent, 'aiTestFailed (HTTP 401)');
    } finally { f.dom.window.close(); }
});

test('failed saves keep the dialog and entered configuration available for retry', async () => {
    const f = await fixture();
    try {
        f.window.options_api.optionsChanged = async () => null;
        f.el('ai-add').click(); f.change('ai-provider', 'openai'); f.el('ai-key').value = 'synthetic-key';
        selectModel(f); f.el('ai-save').click(); await f.tick();
        assert.equal(f.dialog.open, true);
        assert.equal(f.el('ai-key').value, 'synthetic-key');
        assert.equal(f.el('ai-status').textContent, 'msgSaveFailed');
    } finally { f.dom.window.close(); }
});


test('advanced prompt templates keep multiline placeholders per configuration through edit and cancel', async () => {
    const f = await fixture({ aiConfigurations: [{ id: 'other', provider: 'gemini', model: 'custom', apiKey: 'other-key', endpoint: 'https://example.test/api', system_prompt: 'other system', user_prompt: 'other user' }] });
    try {
        f.el('ai-add').click(); f.change('ai-provider', 'openai');
        assert.equal(f.el('ai-advanced').open, false);
        assert.match(f.el('ai-system-prompt').value, /切不可胡编/);
        assert.match(f.el('ai-user-prompt').value, /\{highlight\}/);
        assert.match(f.el('ai-user-prompt').value, /\{context\}/);
        f.el('ai-advanced').querySelector('summary').click();
        assert.equal(f.el('ai-advanced').open, true);
        const system = 'Explain simply. Keep {context} literal until use.';
        const user = 'Selected: {highlight}\nContext: {context}\nMeaning: $&';
        f.el('ai-system-prompt').value = system;
        f.el('ai-user-prompt').value = user;
        // A provider change keeps the prompt being edited.
        f.change('ai-provider', 'deepseek');
        assert.equal(f.el('ai-user-prompt').value, user);
        f.el('ai-key').value = 'synthetic-key';
        selectModel(f); f.el('ai-save').click(); await f.tick();
        const saved = f.writes[0].aiConfigurations;
        assert.equal(saved[0].system_prompt, 'other system');
        assert.equal(saved[1].system_prompt, system);
        assert.equal(saved[1].user_prompt, user);
        f.el('ai-configurations').querySelectorAll('button')[1].click();
        assert.equal(f.el('ai-system-prompt').value, system);
        assert.equal(f.el('ai-user-prompt').value, user);
        f.el('ai-user-prompt').value = 'unsaved prompt';
        f.el('ai-cancel').click();
        f.el('ai-configurations').querySelectorAll('button')[1].click();
        assert.equal(f.el('ai-user-prompt').value, user);
        assert.equal(f.writes.length, 1);
    } finally { f.dom.window.close(); }
});

test('older configurations get prompt defaults while intentionally empty prompts stay empty', async () => {
    const f = await fixture({ aiConfigurations: [
        { id: 'old', provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'old-key', endpoint: 'https://api.openai.com/v1/chat/completions' },
        { id: 'empty', provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'empty-key', endpoint: 'https://api.openai.com/v1/chat/completions', system_prompt: '', user_prompt: '' }
    ] });
    try {
        f.el('ai-configurations').querySelectorAll('button')[0].click();
        assert.match(f.el('ai-system-prompt').value, /英文词汇导师/);
        f.el('ai-cancel').click();
        f.el('ai-configurations').querySelectorAll('button')[1].click();
        assert.equal(f.el('ai-system-prompt').value, '');
        assert.equal(f.el('ai-user-prompt').value, '');
        selectModel(f); f.el('ai-save').click(); await f.tick();
        assert.equal(f.writes[0].aiConfigurations[1].system_prompt, '');
        assert.equal(f.writes[0].aiConfigurations[1].user_prompt, '');
    } finally { f.dom.window.close(); }
});


test('official models load after entering a key and refresh preserves the selected model', async () => {
    let requests = 0;
    const f = await fixture({}, async (url, init) => {
        requests++;
        assert.equal(url, 'https://api.openai.com/v1/models');
        assert.equal(init.headers.Authorization, 'Bearer synthetic-key');
        return { ok: true, json: async () => ({ data: [{ id: 'official-model-b' }, { id: 'official-model-a' }] }) };
    });
    try {
        f.el('ai-add').click(); f.change('ai-provider', 'openai');
        assert.equal(requests, 0);
        assert.equal(f.el('ai-model').options.length, 1, 'no hardcoded model list');
        f.change('ai-key', 'synthetic-key'); await f.tick();
        assert.equal(requests, 1);
        assert.equal(f.el('ai-model').value, 'official-model-a');
        f.el('ai-model').value = 'official-model-b';
        f.el('ai-model-refresh').click(); await f.tick();
        assert.equal(requests, 2);
        assert.equal(f.el('ai-model').value, 'official-model-b');
        assert.equal(f.el('ai-model-status').textContent, 'aiModelsLoaded (2)');
    } finally { f.dom.window.close(); }
});

test('stale model responses cannot overwrite a newly selected provider', async () => {
    let resolveOld;
    const f = await fixture({}, () => new Promise(resolve => { resolveOld = resolve; }));
    try {
        f.el('ai-add').click(); f.change('ai-provider', 'openai'); f.change('ai-key', 'first-key');
        await f.tick();
        f.change('ai-provider', 'deepseek');
        resolveOld({ ok: true, json: async () => ({ data: [{ id: 'wrong-provider-model' }] }) });
        await f.tick();
        assert.equal(f.el('ai-model').options.length, 1);
        assert.equal(f.el('ai-model').value, '');
        assert.equal(f.el('ai-model-refresh').disabled, false);
    } finally { f.dom.window.close(); }
});

test('model list failures expose only HTTP status and keep manual model entry usable', async () => {
    const f = await fixture({}, async () => ({ ok: false, status: 401 }));
    try {
        f.el('ai-add').click(); f.change('ai-provider', 'openai'); f.change('ai-key', 'synthetic-key'); await f.tick();
        assert.equal(f.el('ai-model-status').textContent, 'aiModelsFailed (HTTP 401)');
        f.el('ai-custom').click(); f.el('ai-custom-model').value = 'manual-model';
        f.el('ai-save').click(); await f.tick();
        assert.equal(f.writes[0].aiConfigurations[0].model, 'manual-model');
    } finally { f.dom.window.close(); }
});

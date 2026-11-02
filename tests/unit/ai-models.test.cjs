const assert = require('node:assert/strict');
const test = require('node:test');
const { loadClassic } = require('../helpers/load-classic.cjs');

for (const provider of ['openai', 'deepseek']) {
    test(`${provider} models use the official endpoint and header authentication`, async () => {
        let sent;
        const list = loadClassic('src/bg/js/ai_client.js', 'aiListModels', { URL, fetch: async (url, init) => {
            sent = { url, init };
            return { ok: true, json: async () => ({ data: [{ id: 'model-z' }, { id: 'model-a' }, { id: 'model-z' }] }) };
        } });
        const signal = new AbortController().signal;
        const models = await list(provider, 'synthetic-key', signal);
        assert.deepEqual(Array.from(models), ['model-a', 'model-z']);
        assert.equal(sent.url, provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://api.deepseek.com/models');
        assert.equal(sent.init.headers.Authorization, 'Bearer synthetic-key');
        assert.equal(sent.init.signal, signal);
        assert.equal(sent.init.redirect, 'error');
        assert.equal(sent.url.includes('synthetic-key'), false);
    });
}

test('Gemini loads every page, removes the models prefix and filters unsupported generation methods', async () => {
    const requests = [];
    const list = loadClassic('src/bg/js/ai_client.js', 'aiListModels', { URL, fetch: async (url, init) => {
        requests.push({ url, init });
        return { ok: true, json: async () => requests.length === 1 ? {
            models: [{ name: 'models/gemini-z', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'next page'
        } : { models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }] } };
    } });
    const models = await list('gemini', 'synthetic-key', new AbortController().signal);
    assert.deepEqual(Array.from(models), ['gemini-a', 'gemini-z']);
    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[1].url).searchParams.get('pageToken'), 'next page');
    assert.equal(requests[0].init.headers['x-goog-api-key'], 'synthetic-key');
});

test('malformed or repeating Gemini pages fail rather than loop or masquerade as an empty list', async () => {
    for (const response of [{}, { models: [], nextPageToken: 'repeated' }]) {
        const list = loadClassic('src/bg/js/ai_client.js', 'aiListModels', { URL, fetch: async () => ({ ok: true, json: async () => response }) });
        await assert.rejects(list('gemini', 'synthetic-key', new AbortController().signal), /aiModelsInvalid/);
    }
});

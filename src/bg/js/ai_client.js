/* global aiRenderMarkdown */
const AI_PROVIDERS = {
    openai: { name: 'OpenAI', models: ['gpt-4.1-mini', 'gpt-4.1'], endpoint: 'https://api.openai.com/v1/chat/completions' },
    gemini: { name: 'Gemini', models: ['gemini-3.8-flash'], endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent' },
    deepseek: { name: 'DeepSeek', models: ['deepseek-flash'], endpoint: 'https://api.deepseek.com/chat/completions' }
};

const AI_DEFAULT_PROMPTS = {
    system_prompt: '你是我的英文词汇导师。我会给你英文书籍中的单词或词组。**只需要简洁的讲解，不知道的话请告知即可，切不可胡编**',
    user_prompt: '讲解“{highlight}”在上下文的含义和一个典型句型、搭配用法。格式：含义：；\n典型句型：；\n用法：；\n词源逻辑：a->b...\n\n上下文：{context}'
};

function aiReadConfigurations(options) {
    if (Array.isArray(options.aiConfigurations)) return options.aiConfigurations;
    return Object.entries(AI_PROVIDERS).filter(([key]) => options[`${key}ApiKey`]).map(([provider, defaults]) => ({
        id: `legacy-${provider}`, provider, apiKey: options[`${provider}ApiKey`],
        model: defaults.models[0], customModel: false, endpoint: defaults.endpoint
    }));
}

function aiBuildRequest(config, selection) {
    const url = new URL(config.endpoint.replaceAll('{model}', encodeURIComponent(config.model)));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('aiInvalidEndpoint');
    const headers = { 'Content-Type': 'application/json' };
    let body;
    if (config.provider === 'gemini') {
        headers['x-goog-api-key'] = config.apiKey;
        body = { contents: [{ parts: [{ text: 'Reply OK.' }] }], generationConfig: { maxOutputTokens: 16 } };
    } else {
        headers.Authorization = `Bearer ${config.apiKey}`;
        body = { model: config.model, messages: [{ role: 'user', content: 'Reply OK.' }], max_completion_tokens: 16 };
        if (config.provider === 'deepseek') {
            delete body.max_completion_tokens;
            body.max_tokens = 16;
        }
    }
    if (selection) {
        // One replacement pass: selected text containing a placeholder stays literal.
        const render = template => template.replace(/\{(highlight|context)\}/g, (_, key) => selection[key] || '');
        const system = render(config.system_prompt ?? AI_DEFAULT_PROMPTS.system_prompt);
        const user = render(config.user_prompt ?? AI_DEFAULT_PROMPTS.user_prompt);
        if (config.provider === 'gemini') {
            body.contents = [{ role: 'user', parts: [{ text: user }] }];
            if (system) body.systemInstruction = { parts: [{ text: system }] };
            body.generationConfig.maxOutputTokens = 2048;
        } else {
            body.messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }];
            if (config.provider === 'deepseek') body.max_tokens = 2048;
            else body.max_completion_tokens = 2048;
        }
    }
    return { url, init: { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', credentials: 'omit' } };
}

function aiEscapeHtml(text) {
    return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function aiLookup(config, highlight, context) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
        const { url, init } = aiBuildRequest(config, { highlight, context });
        const response = await fetch(url.href, { ...init, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const text = config.provider === 'gemini'
            ? data.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('')
            : data.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) throw new Error('Empty AI response');
        return aiRenderMarkdown(text);
    } catch (error) {
        // Never expose provider response bodies or network errors containing credentials.
        const detail = controller.signal.aborted ? 'Request timed out' : /^HTTP \d{3}$/.test(error.message) ? error.message : 'Check API configuration, permissions and network';
        // eslint-disable-next-line preserve-caught-error -- cause may contain API keys or page content.
        throw new Error(detail);
    } finally { clearTimeout(timer); }
}


async function aiListModels(provider, apiKey, signal) {
    const endpoints = {
        openai: 'https://api.openai.com/v1/models',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
        deepseek: 'https://api.deepseek.com/models'
    };
    if (!endpoints[provider] || !apiKey) throw new Error('aiModelsKeyRequired');
    const headers = provider === 'gemini' ? { 'x-goog-api-key': apiKey } : { Authorization: `Bearer ${apiKey}` };
    const models = new Set();
    const pageTokens = new Set();
    let token;
    do {
        const url = new URL(endpoints[provider]);
        if (provider === 'gemini') {
            url.searchParams.set('pageSize', '1000');
            if (token) url.searchParams.set('pageToken', token);
        }
        const response = await fetch(url.href, { headers, signal, redirect: 'error', credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const items = provider === 'gemini' ? data.models : data.data;
        if (!Array.isArray(items)) throw new Error('aiModelsInvalid');
        for (const item of items) {
            if (provider === 'gemini') {
                if (item.supportedGenerationMethods?.includes('generateContent') && typeof item.name === 'string') models.add(item.name.replace(/^models\//, ''));
            } else if (typeof item.id === 'string') models.add(item.id);
        }
        token = provider === 'gemini' ? data.nextPageToken : undefined;
        if (token && pageTokens.has(token)) throw new Error('aiModelsInvalid');
        if (token) pageTokens.add(token);
    } while (token);
    return [...models].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

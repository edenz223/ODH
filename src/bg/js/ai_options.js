/* global optionsLoad, options_api, AI_PROVIDERS, AI_DEFAULT_PROMPTS, aiReadConfigurations, aiBuildRequest, aiListModels, populateDictionary */
async function initializeAiOptions() {
    const el = id => document.getElementById(id);
    const msg = key => chrome.i18n.getMessage(key) || key;
    const dialog = el('ai-dialog');
    const form = el('ai-form');
    let configurations = aiReadConfigurations(await optionsLoad());
    let editingId = null;
    let busy = false;
    let controller;
    let revision = 0;
    let modelController;
    let modelRevision = 0;
    let modelDebounce;
    let loadedModelsFor = '';
    const modelStatus = (key, suffix = '') => { el('ai-model-status').textContent = msg(key) + suffix; };
    function cancelModels() {
        modelRevision++;
        modelController?.abort();
        clearTimeout(modelDebounce);
        el('ai-model-refresh').disabled = false;
        el('ai-model').removeAttribute('aria-busy');
    }
    function resetModels(selected = '') {
        el('ai-model').replaceChildren(new Option(msg('aiModelsChoose'), ''));
        if (selected) el('ai-model').add(new Option(selected, selected));
        el('ai-model').value = selected;
        loadedModelsFor = '';
    }
    async function loadModels(requestPermission = false) {
        cancelModels();
        const provider = el('ai-provider').value;
        const key = el('ai-key').value.trim();
        if (!provider || !key) { modelStatus('aiModelsKeyRequired'); return; }
        const current = modelRevision;
        const origin = new URL(AI_PROVIDERS[provider].endpoint).origin + '/*';
        const selected = el('ai-model').value;
        modelController = new AbortController();
        const signal = modelController.signal;
        el('ai-model-refresh').disabled = true;
        el('ai-model').setAttribute('aria-busy', 'true');
        modelStatus('aiModelsLoading');
        const timeout = setTimeout(() => modelController?.signal === signal && modelController.abort(), 15000);
        try {
            const allowed = requestPermission
                ? await chrome.permissions.request({ origins: [origin] })
                : await chrome.permissions.contains({ origins: [origin] });
            if (current !== modelRevision) return;
            if (!allowed) { modelStatus('aiModelsPermission'); return; }
            const models = await aiListModels(provider, key, signal);
            if (current !== modelRevision || !dialog.open) return;
            resetModels();
            for (const model of models) el('ai-model').add(new Option(model, model));
            if (selected && !models.includes(selected)) el('ai-model').add(new Option(selected, selected));
            el('ai-model').value = selected || models[0] || '';
            loadedModelsFor = provider + ':' + key;
            modelStatus(models.length ? 'aiModelsLoaded' : 'aiModelsEmpty', models.length ? ` (${models.length})` : '');
        } catch (error) {
            if (current === modelRevision) {
                const detail = /^HTTP \d{3}$/.test(error.message) ? ` (${error.message})` : '';
                modelStatus(signal.aborted ? 'aiModelsTimeout' : 'aiModelsFailed', detail);
            }
        } finally {
            clearTimeout(timeout);
            if (current === modelRevision) {
                el('ai-model-refresh').disabled = false;
                el('ai-model').removeAttribute('aria-busy');
            }
        }
    }
    const status = (key, suffix = '') => { el('ai-status').textContent = key ? msg(key) + suffix : ''; };
    function customMode() {
        const custom = el('ai-custom').checked;
        el('ai-model').hidden = custom;
        el('ai-model').disabled = custom;
        el('ai-custom-model').hidden = !custom;
        el('ai-custom-model').disabled = !custom;
        el('ai-custom-model').required = custom;
        el('ai-model').required = !custom;
        el('ai-model').setAttribute('aria-label', msg('aiModel'));
        el('ai-custom-model').setAttribute('aria-label', msg('aiModel'));
    }
    function providerChanged(config) {
        const defaults = AI_PROVIDERS[el('ai-provider').value];
        el('ai-details').hidden = !defaults;
        el('ai-save').disabled = !defaults;
        el('ai-key').disabled = !defaults;
        el('ai-endpoint').disabled = !defaults;
        cancelModels();
        resetModels(config?.model || '');
        if (!defaults) return;
        el('ai-key').value = config?.apiKey || '';
        el('ai-endpoint').value = config?.endpoint || defaults.endpoint;
        el('ai-custom').checked = Boolean(config?.customModel);
        el('ai-model').value = config?.model || '';
        el('ai-custom-model').value = config?.model || '';
        customMode();
        status('');
        modelStatus('aiModelsKeyRequired');
    }
    function open(config) {
        form.reset();
        editingId = config?.id || null;
        el('ai-advanced').open = false;
        el('ai-system-prompt').value = config?.system_prompt ?? AI_DEFAULT_PROMPTS.system_prompt;
        el('ai-user-prompt').value = config?.user_prompt ?? AI_DEFAULT_PROMPTS.user_prompt;
        el('ai-dialog-title').textContent = msg(config ? 'aiEdit' : 'aiAdd');
        el('ai-provider').value = config?.provider || '';
        providerChanged(config);
        status('');
        dialog.showModal();
        if (config?.apiKey) void loadModels();
    }
    function render() {
        el('ai-configurations').replaceChildren();
        el('ai-empty').hidden = configurations.length > 0;
        for (const config of configurations) {
            const row = document.createElement('div');
            row.className = 'ai-card';
            const info = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = AI_PROVIDERS[config.provider]?.name || config.provider;
            const model = document.createElement('p');
            model.textContent = config.model;
            info.append(name, model);
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.textContent = msg('aiEdit');
            edit.addEventListener('click', () => open(config));
            row.append(info, edit);
            el('ai-configurations').append(row);
        }
    }
    function readForm() {
        return {
            id: editingId || crypto.randomUUID(), provider: el('ai-provider').value,
            apiKey: el('ai-key').value.trim(),
            model: (el('ai-custom').checked ? el('ai-custom-model').value : el('ai-model').value).trim(),
            customModel: el('ai-custom').checked, endpoint: el('ai-endpoint').value.trim(),
            system_prompt: el('ai-system-prompt').value,
            user_prompt: el('ai-user-prompt').value
        };
    }
    function validatedConfig() {
        if (!form.reportValidity()) return null;
        const config = readForm();
        if (!config.apiKey || !config.model) { status('aiRequired'); return null; }
        try { aiBuildRequest(config); } catch { status('aiInvalidEndpoint'); return null; }
        return config;
    }
    function setBusy(value) {
        busy = value;
        el('ai-save').disabled = value || !el('ai-provider').value;
        el('ai-test').disabled = value;
        el('ai-cancel').disabled = value;
    }
    el('ai-add').setAttribute('aria-label', msg('aiAdd'));
    el('ai-add').addEventListener('click', () => open());
    el('ai-provider').addEventListener('change', () => providerChanged());
    el('ai-custom').addEventListener('change', customMode);
    el('ai-model-refresh').addEventListener('click', () => { void loadModels(true); });
    el('ai-key').addEventListener('input', () => {
        cancelModels();
        resetModels(el('ai-model').value);
        modelStatus('aiModelsKeyRequired');
        modelDebounce = setTimeout(() => { void loadModels(); }, 500);
    });
    el('ai-key').addEventListener('change', () => { void loadModels(true); });
    el('ai-model').addEventListener('pointerdown', () => {
        if (loadedModelsFor !== el('ai-provider').value + ':' + el('ai-key').value.trim()) void loadModels(true);
    });
    form.addEventListener('input', () => { revision++; controller?.abort(); status(''); });
    el('ai-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { cancelModels(); el('ai-key').value = ''; });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const config = validatedConfig();
        if (!config) return;
        setBusy(true);
        try {
            const url = new URL(config.endpoint);
            const official = Object.values(AI_PROVIDERS).some(provider => new URL(provider.endpoint).origin === url.origin);
            if (official && !await chrome.permissions.request({ origins: [url.origin + '/*'] })) {
                status('aiPermissionDenied'); return;
            }
            const options = await optionsLoad();
            const latest = aiReadConfigurations(options);
            options.aiConfigurations = editingId ? latest.map(item => item.id === editingId ? config : item) : [...latest, config];
            for (const key of Object.keys(AI_PROVIDERS)) options[`${key}ApiKey`] = '';
            const saved = await options_api.optionsChanged(options);
            if (!saved) throw new Error('save');
            configurations = aiReadConfigurations(saved);
            render();
            const selected = document.getElementById('dict').value;
            populateDictionary(saved.dictNamelist);
            document.getElementById('dict').value = saved.dictNamelist.some(item => item.objectname === selected) ? selected : saved.dictSelected;
            dialog.close();
        } catch { status('msgSaveFailed'); }
        finally { setBusy(false); }
    });
    el('ai-test').addEventListener('click', async () => {
        if (busy) return;
        const config = validatedConfig();
        if (!config) return;
        const { url, init } = aiBuildRequest(config);
        // Only the three declared provider domains can request extension permissions.
        const official = Object.values(AI_PROVIDERS).some(provider => new URL(provider.endpoint).origin === url.origin);
        const currentRevision = revision;
        controller = new AbortController();
        setBusy(true);
        status('aiTesting');
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            if (official && !await chrome.permissions.request({ origins: [url.origin + '/*'] })) {
                status('aiPermissionDenied'); return;
            }
            const response = await fetch(url.href, { ...init, signal: controller.signal });
            if (revision !== currentRevision) return;
            if (!response.ok) { status('aiTestFailed', ` (HTTP ${response.status})`); return; }
            const data = await response.json();
            const valid = config.provider === 'gemini' ? data.candidates?.length > 0 : data.choices?.length > 0;
            status(valid ? 'aiTestSuccess' : 'aiInvalidResponse');
        } catch {
            if (revision === currentRevision) status(controller.signal.aborted ? 'aiTestTimeout' : 'aiTestNetwork');
        } finally { clearTimeout(timeout); setBusy(false); }
    });
    render();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeAiOptions().catch(() => {
        document.getElementById('ai-empty').textContent = chrome.i18n.getMessage('aiLoadFailed');
        document.getElementById('ai-add').disabled = true;
    });
});

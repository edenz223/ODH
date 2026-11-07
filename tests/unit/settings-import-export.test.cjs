const assert = require('node:assert/strict');
const test = require('node:test');
const { loadClassic } = require('../helpers/load-classic.cjs');

function loadHelpers() {
    return loadClassic('src/bg/js/options.js',
        '({ configExportPayload, parseConfig, mergeImportedOptions })', {
            $: () => ({ ready() {} }),
            document: {},
            window: {},
            chrome: { i18n: { getMessage() { return ''; } } },
            OptionsAPI: class {},
            localizeHtmlPage() {},
            utilAsync(fn) { return fn; },
            optionsLoad: async () => ({})
        });
}

test('export wraps the settings and drops runtime dictionary state', () => {
    const { configExportPayload } = loadHelpers();
    const settings = {
        enabled: false,
        sysscripts: 'builtin_encn_Collins',
        dictNamelist: [{ objectname: 'builtin_encn_Collins' }]
    };
    const payload = configExportPayload(settings);
    assert.equal(payload.format, 'odh-config');
    assert.equal(payload.version, 1);
    assert.match(payload.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(payload.options.enabled, false);
    assert.equal(payload.options.sysscripts, 'builtin_encn_Collins');
    assert.equal('dictNamelist' in payload.options, false);
    assert.equal('dictNamelist' in settings, true);
});

test('import parsing accepts wrapped and bare settings and rejects malformed files', () => {
    const { parseConfig } = loadHelpers();
    assert.equal(parseConfig('{"format":"odh-config","options":{"enabled":true}}').enabled, true);
    assert.equal(parseConfig('{"enabled":false}').enabled, false);
    for (const text of ['not json', 'null', '[]', '"text"', '{"format":"other","options":{}}', '{"options":[]}']) {
        assert.equal(parseConfig(text), null, text);
    }
});

test('import merge keeps local values and cannot pollute object prototypes', () => {
    const { mergeImportedOptions } = loadHelpers();
    const merged = mergeImportedOptions(
        { enabled: true, tags: 'ODH', dictNamelist: [{ objectname: 'old' }] },
        { enabled: false, dictNamelist: [{ objectname: 'new' }], ['__proto__']: { polluted: true } }
    );
    assert.equal(merged.enabled, false);
    assert.equal(merged.tags, 'ODH');
    assert.deepEqual(merged.dictNamelist, [{ objectname: 'old' }]);
    assert.equal(merged.polluted, undefined);
});

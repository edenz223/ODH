/* global localizeHtmlPage, utilAsync, optionsLoad */

async function populateAnkiDeckAndModel(options) {
    $('#deckname').empty();
    let names = await options_api.getDeckNames();
    // WHY: a failed query means Anki is unreachable, so the lists stay empty rather than
    // reading names[0] off null and rejecting unhandled.
    if (names === null) return;
    names.forEach(name => $('#deckname').append($('<option>', { value: name, text: name })));

    let deckName = options.deckname ? options.deckname : names[0];
    $('#deckname').val(deckName);

    $('#typename').empty();
    names = await options_api.getModelNames();
    if (names === null) return;
    names.forEach(name => $('#typename').append($('<option>', { value: name, text: name })));

    let typeName = options.typename ? options.typename: names[0];
    $('#typename').val(typeName);
}

async function populateAnkiFields(options) {
    const modelName = $('#typename').val() || options.typename;
    if (modelName === null) return;

    let names = await options_api.getModelFieldNames(modelName);
    if (names == null) return;

    let fields = ['expression', 'reading', 'extrainfo', 'definition', 'definitions', 'sentence', 'url', 'audio'];
    fields.forEach(field => {
        $(`#${field}`).empty();
        $(`#${field}`).append($('<option>', { value: '', text: '' }));
        names.forEach(name => $(`#${field}`).append($('<option>', { value: name, text: name })));
        $(`#${field}`).val(options[field]);
    });
}

async function updateServiceStatus(options) {
    $('.service-options').hide();
    $('#services-status').text(chrome.i18n.getMessage('msgFailed'));
    switch (options.services) {
        case 'none':
            break;
        case 'ankiconnect':
            $('#service-options-ankiconnect').show();
            updateAnkiProfile(options) 
            break;
        default:
            break;
    }
}

async function updateAnkiProfile(options) {
    $('#service-options-ankiprofile').hide();
    $('#services-status').text(chrome.i18n.getMessage('msgConnecting'));
    
    let version = await options_api.getVersion();
    if (version === null) {
        $('#services-status').text(chrome.i18n.getMessage('msgFailed'));
    } else {
        // WHY: the field list reads the model select, so it has to run after that select is
        // filled. Awaiting both also keeps a failed query from rejecting unhandled.
        await populateAnkiDeckAndModel(options);
        await populateAnkiFields(options);
        $('#services-status').text(chrome.i18n.getMessage('msgSuccess', [version]));
        $('#service-options-ankiprofile').show();
        if (options.services == 'ankiconnect')
            $('#duplicate-option').show();
        else {
            $('#duplicate-option').hide();
        }
    }
}

function populateDictionary(dicts) {
    $('#dict').empty();
    dicts.forEach(item => $('#dict').append($('<option>', { value: item.objectname, text: item.displayname })));
}

function populateSysScriptsList(dictLibrary) {
    const optionscripts = Array.from(new Set(dictLibrary.split(',').filter(x => x).map(x => x.trim())));
    let systemscripts = [
        'builtin_encn_Collins', 'general_Makenotes',//default & builtin script
        'cncn_Zdic', //cn-cn dictionary
        'encn_Collins', 'encn_Cambridge', 'encn_Cambridge_tc', 'encn_Oxford', 'encn_Youdao', //en-cn dictionaries
        'enen_Collins', 'enen_LDOCE6MDX', 'enen_UrbanDict', //en-en dictionaries
        'enfr_Cambridge', 'enfr_Collins', //en-fr dictionaries
        'fren_Cambridge', 'fren_Collins', //fr-cn dictionaries
        'esen_Spanishdict', 'decn_Eudict', 'escn_Eudict', 'frcn_Eudict', 'frcn_Youdao', 'rucn_Qianyi' //msci dictionaries
    ];
    $('#scriptslistbody').empty();
    systemscripts.forEach(script => {
        let row = '';
        row += `<input class="sl-col sl-col-onoff" type="checkbox" ${optionscripts.includes(script) || optionscripts.includes('lib://'+script)?'checked':''}>`;
        row += `<input class="sl-col sl-col-cloud" type="checkbox" ${optionscripts.includes('lib://'+script)?'checked':''}>`;
        row += `<span class="sl-col sl-col-name">${script}</span>`;
        row += `<span class="sl-col sl-col-description">${chrome.i18n.getMessage(script)}</span>`;
        $('#scriptslistbody').append($(`<div class="sl-row">${row}</div>`));
    });

    $('.sl-col-onoff', '.sl-row:nth-child(1)').prop('checked', true); // make default script(first row) always active.
    $('.sl-col-cloud', '.sl-row:nth-child(1)').prop('checked', false); // make default script(first row) as local script.
    $('.sl-col-cloud, .sl-col-onoff', '.sl-row:nth-child(1)').css({ 'visibility': 'hidden' }); //make default sys script untouch
}

function onScriptListChange() {
    let dictLibrary = [];
    $('.sl-row').each(function() {
        if ($('.sl-col-onoff', this).prop('checked') == true)
            dictLibrary.push($('.sl-col-cloud', this).prop('checked') ? 'lib://' + $('.sl-col-name', this).text() : $('.sl-col-name', this).text());
    });
    $('#sysscripts').val(dictLibrary.join());
}

let cloudColumnsHidden = true;

function setCloudColumnsHidden(hidden) {
    cloudColumnsHidden = hidden;
    $('.sl-col-cloud').toggleClass('hidden', hidden);
}

function onHiddenClicked() {
    setCloudColumnsHidden(!cloudColumnsHidden);
}

async function onAnkiTypeChanged(e) {
    if (e.originalEvent) {
        let options = await optionsLoad();
        await populateAnkiFields(options);

    }
}

async function onServicesChanged(e) {
    if (e.originalEvent) {
        try {
            let options = await optionsLoad();

            options.services = $('#services').val();
            options.id = $('#id').val() ?? options.id;
            options.password = $('#password').val() ?? options.password;
            options.ankiconnecturl = $('#ankiconnecturl').val();

            let newOptions = await options_api.optionsChanged(options);
            if (!newOptions) {
                throw new Error('Settings were not confirmed.');
            }
            await updateServiceStatus(newOptions);
        } catch {
            $('#services-status').text(chrome.i18n.getMessage('msgSaveFailed'));
        }
    }
}

async function onSaveClicked(e) {
    if (!e.originalEvent) return;

    $('.gif').hide();
    $('#gif-load').show();
    try {
        let optionsOld = await optionsLoad();
        let options = $.extend(true, {}, optionsOld);

        options.enabled = $('#enabled').prop('checked');
        options.mouseselection = $('#mouseselection').prop('checked');
        options.hotkey = $('#hotkey').val();

        options.dictSelected = $('#dict').val();
        options.monolingual = $('#monolingual').val();
        options.preferredaudio = $('#anki-preferred-audio').val();
        options.maxcontext = $('#maxcontext').val();
        options.maxexample = $('#maxexample').val();

        options.services = $('#services').val();
        options.id = $('#id').val() ?? options.id;
        options.password = $('#password').val() ?? options.password;

        options.ankiconnecturl = $('#ankiconnecturl').val();
        options.tags = $('#tags').val();
        options.duplicate = $('#duplicate').val();

        let fields = ['deckname', 'typename', 'expression', 'reading', 'extrainfo', 'definition', 'definitions', 'sentence', 'url', 'audio'];
        fields.forEach(field => {
            options[field] = $(`#${field}`).val() == null ? options[field] : $(`#${field}`).val();
        });

        options.sysscripts = $('#sysscripts').val();
        options.udfscripts = $('#udfscripts').val();

        let newOptions = await options_api.optionsChanged(options);
        if (!newOptions) {
            throw new Error('Settings were not confirmed.');
        }

        populateDictionary(newOptions.dictNamelist);
        $('#dict').val(newOptions.dictSelected);

        $('#gif-good').show(1000, () => { $('.gif').hide(); });

        if (e.target.id == 'saveclose')
            window.close();
    } catch {
        $('#gif-fail').show();
    } finally {
        $('#gif-load').hide();
    }
}

function onCloseClicked() {
    window.close();
}

const CONFIG_EXPORT_FORMAT = 'odh-config';
const CONFIG_EXPORT_VERSION = 1;
// Runtime state rebuilt from the installed scripts on every load, so it would only be stale.
const CONFIG_EXCLUDED_KEYS = ['dictNamelist'];

function configExportPayload(options) {
    const exported = { ...options };
    for (const key of CONFIG_EXCLUDED_KEYS) delete exported[key];
    return {
        format: CONFIG_EXPORT_FORMAT,
        version: CONFIG_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        options: exported,
    };
}

// Accepts both the wrapped export above and a bare settings object.
function parseConfig(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.format !== undefined && parsed.format !== CONFIG_EXPORT_FORMAT) return null;
    const options = Object.prototype.hasOwnProperty.call(parsed, 'options') ? parsed.options : parsed;
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    return options;
}

function mergeImportedOptions(current, imported) {
    const merged = { ...current };
    for (const key of Object.keys(imported)) {
        // WHY: imported files are untrusted input, and a `__proto__` key would otherwise
        // reach the prototype through the assignment below.
        if (CONFIG_EXCLUDED_KEYS.includes(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        merged[key] = imported[key];
    }
    return merged;
}

function downloadConfig(options) {
    const blob = new Blob([JSON.stringify(configExportPayload(options), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `odh-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function setConfigStatus(messageKey, failed = false) {
    $('#config-status')
        .text(messageKey ? chrome.i18n.getMessage(messageKey) : '')
        .toggleClass('error', failed);
}

async function onExportClicked(e) {
    if (!e.originalEvent) return;
    setConfigStatus('');
    try {
        downloadConfig(await optionsLoad());
        setConfigStatus('msgConfigExported');
    } catch {
        setConfigStatus('msgConfigExportFailed', true);
    }
}

function onImportClicked(e) {
    if (!e.originalEvent) return;
    setConfigStatus('');
    $('#import-file').val('');
    $('#import-file').click();
}

async function onImportFileChanged(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;

    let imported;
    try {
        imported = parseConfig(await file.text());
    } catch {
        imported = null;
    }
    if (!imported) {
        setConfigStatus('msgConfigImportInvalid', true);
        input.value = '';
        return;
    }

    try {
        const current = await optionsLoad();
        const newOptions = await options_api.optionsChanged(mergeImportedOptions(current, imported));
        if (!newOptions) throw new Error('Settings were not confirmed.');
        applyOptionsToPage(newOptions);
        updateServiceStatus(newOptions);
        setConfigStatus('msgConfigImported');
    } catch {
        setConfigStatus('msgConfigImportFailed', true);
    } finally {
        input.value = '';
    }
}

function applyOptionsToPage(options) {
    $('#enabled').prop('checked', options.enabled);
    $('#mouseselection').prop('checked', options.mouseselection);
    $('#hotkey').val(options.hotkey);

    populateDictionary(options.dictNamelist);
    $('#dict').val(options.dictSelected);

    $('#monolingual').val(options.monolingual);
    $('#anki-preferred-audio').val(options.preferredaudio);
    $('#maxcontext').val(options.maxcontext);
    $('#maxexample').val(options.maxexample);

    $('#services').val(options.services);
    $('#id').val(options.id);
    $('#password').val(options.password);

    $('#ankiconnecturl').val(options.ankiconnecturl);
    $('#tags').val(options.tags);
    $('#duplicate').val(options.duplicate);

    let fields = ['deckname', 'typename', 'expression', 'reading', 'extrainfo', 'definition', 'definitions', 'sentence', 'url', 'audio'];
    fields.forEach(field => {
        $(`#${field}`).val(options[field]);
    });

    $('#sysscripts').val(options.sysscripts);
    $('#udfscripts').val(options.udfscripts);
    populateSysScriptsList(options.sysscripts);
    setCloudColumnsHidden(cloudColumnsHidden);
}

async function onReady() {
    localizeHtmlPage();
    let options = await optionsLoad();
    applyOptionsToPage(options);

    $('#connect').click(onServicesChanged);
    $('#saveload').click(onSaveClicked);
    $('#saveclose').click(onSaveClicked);
    $('#close').click(onCloseClicked);
    $('#export-config').click(onExportClicked);
    $('#import-config').click(onImportClicked);
    $('#import-file').change(onImportFileChanged);
    $('.gif').hide();

    $('.sl-col-onoff, .sl-col-cloud').click(onScriptListChange);
    $('#hidden').click(onHiddenClicked);
    $('#typename').change(onAnkiTypeChanged);
    $('#services').change(onServicesChanged);

    updateServiceStatus(options);
}

$(document).ready(utilAsync(onReady));
const options_api = new OptionsAPI();

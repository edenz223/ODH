const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { loadClassic } = require('../helpers/load-classic.cjs');

for (const shadow of [false, true]) {
    test('working reference extracts the selected YouTube caption' + (shadow ? ' inside a shadow root' : ''), () => {
        const dom = new JSDOM('<!doctype html><div id="host"></div>', { runScripts: 'outside-only' });
        try {
            const root = shadow ? dom.window.document.querySelector('#host').attachShadow({ mode: 'open' }) : dom.window.document.querySelector('#host');
            root.innerHTML = '<div class="html5-video-player" id="movie_player"><video></video><div>CancelConfirm Up next</div><div id="st-captions-container"><span class="original-text">Just scroll through social media.</span></div></div>';
            const text = root.querySelector('.original-text').firstChild;
            const range = dom.window.document.createRange();
            range.setStart(text, 12); range.setEnd(text, 19);
            const selection = { rangeCount: 1, getRangeAt: () => range, toString: () => 'through', getComposedRanges: () => [{ startContainer: text, startOffset: 12, endContainer: text, endOffset: 19 }] };
            dom.window.getSelection = () => selection;
            const helpers = loadClassic('src/fg/js/text.js', '({ selectedText, getSentence })', {}, dom.getInternalVMContext());
            assert.equal(helpers.selectedText(), 'through');
            assert.equal(helpers.getSentence(1), 'Just scroll <b>through</b> social media.');
        } finally { dom.window.close(); }
    });
}

test('caption snapshot survives removal during debounce and during AI lookup', async () => {
    let word = 'through';
    let sentence = 'Just scroll <b>through</b> social media.';
    let debounce;
    let finish;
    let sent;
    const realm = {
        chrome: { runtime: { onMessage: { addListener() {} } } },
        document: { addEventListener() {} },
        window: { addEventListener() {} },
        setTimeout: fn => { debounce = fn; return 1; }, clearTimeout() {},
        selectedText: () => word, getSentence: () => sentence, getAnchorRect: () => null,
        isEmpty: value => !value, isValidElement: () => true, sanitizeNote: note => note,
        Popup: class { showNextTo() {} }, FrontendAPI: class {}
    };
    const api = { getTranslation: (expression, context) => { sent = { expression, context }; return new Promise(resolve => { finish = resolve; }); } };
    // The classic script reads frontend_api as a global binding at lookup time.
    const vm = require('node:vm');
    const context = vm.createContext({ ...realm, frontend_api: api });
    const live = loadClassic('src/fg/js/frontend.js', 'window.odh_frontend', {}, context);
    live.mousemoved = true;
    live.point = { x: 1, y: 1 };
    live.renderPopup = async () => '';
    live.userSelectionChanged({});
    word = ''; sentence = '';
    debounce();
    assert.equal(sent.expression, 'through');
    assert.equal(sent.context, 'Just scroll <b>through</b> social media.');
    finish('AI answer');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(live.sentence, 'Just scroll <b>through</b> social media.');
    assert.equal(live.notes[0].expression, 'through');
});


for (const [selector, expected] of [
    ['#content-text span', "They are <b>learning</b> guys, don't let up now"],
    ['h1 span', 'How <b>learning</b> changes your brain']
]) {
    test('YouTube ' + (selector.startsWith('h1') ? 'title' : 'comment') + ' keeps its own sentence beside the video player', () => {
        const dom = new JSDOM(`<ytd-watch-flexy><div id="movie_player" class="html5-video-player"><video></video><div class="captions-text">Subtitle learning must not replace a comment.</div></div><main><h1><yt-formatted-string><span>How learning changes your brain</span></yt-formatted-string></h1><ytd-comment-thread-renderer><div id="expander"><yt-attributed-string id="content-text"><span>They are learning guys, don't let up now</span></yt-attributed-string><button>Read more</button></div></ytd-comment-thread-renderer></main></ytd-watch-flexy>`, { runScripts: 'outside-only' });
        try {
            const doc = dom.window.document;
            const node = doc.querySelector(selector).firstChild;
            const start = node.textContent.indexOf('learning');
            const range = doc.createRange(); range.setStart(node, start); range.setEnd(node, start + 8);
            dom.window.getSelection = () => ({ rangeCount: 1, getRangeAt: () => range, toString: () => 'learning' });
            const helpers = loadClassic('src/fg/js/text.js', '({ getSentence, isInsidePlayer })', {}, dom.getInternalVMContext());
            assert.equal(helpers.isInsidePlayer(node.parentElement), false);
            assert.equal(helpers.getSentence(1), expected);
            assert.equal(helpers.isInsidePlayer(doc.querySelector('.captions-text')), true);
        } finally { dom.window.close(); }
    });
}

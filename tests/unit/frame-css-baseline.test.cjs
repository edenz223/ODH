const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const frameCss = fs.readFileSync(path.resolve(__dirname, '../../src/fg/css/frame.css'), 'utf8');

// The dictionary baseline at the end of frame.css is what a dictionary falls back to when it
// ships no CSS. Two properties of that block are load-bearing and easy to break by accident:
// the selectors stay bare (a higher-specificity prefix would outrank the dictionary's own
// stylesheet everywhere) and no declaration uses !important (a dictionary that does use it
// must still win). Both are asserted here because the failure would be silent in the browser.

const baselineSelectors = [
    'span.star', 'span.pos', 'span.tran', 'span.eng_tran', 'span.chn_tran',
    'ul.sents', 'li.sent', 'span.eng_sent', 'span.chn_sent'
];

function ruleText(selector) {
    const pattern = new RegExp(`(?:^|[}\\s,])${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm');
    const match = frameCss.match(pattern);
    return match ? match[1] : null;
}

test('the dictionary baseline covers the shared selectors', () => {
    const missing = baselineSelectors.filter((selector) => ruleText(selector) === null);
    assert.deepEqual(missing, [], 'every shared dictionary selector needs a baseline rule');
});

test('the baseline keeps bare selectors so a dictionary stylesheet can still win', () => {
    const prefixed = baselineSelectors.filter((selector) =>
        new RegExp(`\\.odh-notes\\s+${selector.replace('.', '\\.')}\\s*\\{`).test(frameCss));
    assert.deepEqual(prefixed, [], 'a .odh-notes prefix would raise specificity above the dictionary');
});

test('the baseline never uses !important', () => {
    const offenders = baselineSelectors.filter((selector) => {
        const body = ruleText(selector);
        return body !== null && body.includes('!important');
    });
    assert.deepEqual(offenders, [], '!important would beat a dictionary that sets it itself');
});

test('the baseline is a trailing section outside the odh- namespace', () => {
    const lastOwnRule = frameCss.lastIndexOf('.highlight {');
    const firstBaselineRule = frameCss.indexOf('span.star {');
    assert.ok(lastOwnRule !== -1 && firstBaselineRule > lastOwnRule,
        'the baseline is a trailing section, not interleaved with the extension UI rules');
    for (const selector of baselineSelectors) {
        assert.ok(!selector.includes('odh-'), 'baseline selectors must not target extension UI classes');
    }
});

test('ordinary definitions keep their original card frame independently of Markdown styles', () => {
    const dom = new JSDOM('<!doctype html><style>' + frameCss + '</style><div class="odh-definition">Dictionary definition</div><div class="odh-sentence">Context</div>');
    try {
        const definition = dom.window.getComputedStyle(dom.window.document.querySelector('.odh-definition'));
        assert.equal(definition.padding, '5px');
        assert.equal(definition.marginTop, '5px');
        assert.equal(definition.borderTopWidth, '1px');
        assert.equal(definition.borderTopStyle, 'solid');
        assert.equal(definition.borderRadius, '3px');
        assert.equal(definition.backgroundColor, 'rgb(254, 254, 254)');
        const sentence = dom.window.getComputedStyle(dom.window.document.querySelector('.odh-sentence'));
        assert.equal(sentence.padding, '0px');
        assert.equal(sentence.borderTopWidth, '2px');
        assert.equal(sentence.borderTopStyle, 'dashed');
    } finally { dom.window.close(); }
});

test('Markdown formatting applies only inside the Markdown wrapper', () => {
    const dom = new JSDOM('<!doctype html><style>' + frameCss + '</style><div class="odh-definition"><code id="ordinary">dictionary code</code><div class="odh-markdown"><code id="markdown">AI code</code></div></div>');
    try {
        const style = id => dom.window.getComputedStyle(dom.window.document.getElementById(id));
        assert.equal(style('markdown').backgroundColor, 'rgb(241, 245, 249)');
        assert.notEqual(style('ordinary').backgroundColor, style('markdown').backgroundColor);
    } finally { dom.window.close(); }
});

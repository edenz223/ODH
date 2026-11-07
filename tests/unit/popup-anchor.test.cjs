const assert = require('node:assert/strict');
const test = require('node:test');
const { loadClassic } = require('../helpers/load-classic.cjs');

const zero = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
const fakeRange = (rect, rects = []) => ({ getBoundingClientRect: () => rect, getClientRects: () => rects });

function anchorWith({ selection = null, caret = null }) {
    return loadClassic('src/fg/js/range.js', 'getAnchorRect', {
        getSelectedRange: () => selection,
        document: { caretRangeFromPoint: () => caret }
    });
}

test('anchor uses the selected caption, not the player element under the mouse', () => {
    const caption = { left: 600, right: 660, top: 520, bottom: 545, width: 60, height: 25 };
    const getAnchorRect = anchorWith({ selection: fakeRange(caption), caret: fakeRange(zero) });
    assert.equal(getAnchorRect({ x: 644, y: 539 }), caption);
});

test('anchor falls back to the last client rect of a range measuring as zero', () => {
    const line = { left: 10, right: 40, top: 20, bottom: 30, width: 30, height: 10 };
    const getAnchorRect = anchorWith({ selection: fakeRange(zero, [zero, line]) });
    assert.equal(getAnchorRect({ x: 1, y: 1 }), line);
});

test('anchor falls back to the mouse point when no range can be measured', () => {
    for (const caret of [null, fakeRange(zero)]) {
        const getAnchorRect = anchorWith({ selection: fakeRange(zero), caret });
        assert.deepEqual({ ...getAnchorRect({ x: 644, y: 539 }) }, { left: 644, right: 644, top: 539, bottom: 539, width: 0, height: 0 });
    }
});

test('anchor is null when there is neither a measurable selection nor a point', () => {
    assert.equal(anchorWith({})(null), null);
});

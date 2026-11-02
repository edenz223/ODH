HtmlTagsToReplace = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
};

function replaceHtmlTag(tag) {
    return HtmlTagsToReplace[tag] || tag;
}

function escapeHtmlTag(string) {
    return string.replace(/[&<>]/g, replaceHtmlTag);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

String.prototype.replaceAll = function(search, replacement) {
    let target = this;
    search = escapeRegExp(search);
    return target.replace(new RegExp(search, 'g'), replacement);
};

String.prototype.searchAll = function(search) {
    let target = this;
    search = escapeRegExp(search);
    let regex = new RegExp(search, 'gi');
    let result = 0;
    let indices = [];
    while ((result = regex.exec(target)) && result != '') {
        indices.push(result.index);
    }
    return indices;
};

function isPDFJSPage() {
    return (document.querySelectorAll('div#viewer.pdfViewer').length > 0);
}

function isEmpty(word) {
    return (!word);
}

function isShortandNum(word) {
    let numReg = /\d/;
    return (word.length < 3 || numReg.test(word));
}

function isChinese(word) {
    let cnReg = /[\u4e00-\u9fa5]+/gi;
    return (cnReg.test(word));
}

function isInvalid(word) {
    if (isChinese(word)) return false;
    return (isChinese(word) && isEmpty(word) || isShortandNum(word));
}

function stripPlayerGarbage(text) {
    if (!text) return '';
    return text
        .replace(/To avoid this, cancel and sign in to YouTube on your computer\.?\s*(CancelConfirm)?/gi, '')
        .replace(/CancelConfirm/gi, '')
        .replace(/Up nextLiveUpcomingCancelPlay Now/gi, '')
        .replace(/Share\s*Include playlist\s*An error occurred while retrieving sharing information\.?/gi, '')
        .replace(/Include playlist\s*An error occurred while retrieving sharing information\.?/gi, '')
        .replace(/An error occurred while retrieving sharing information\.?/gi, '')
        .replace(/Please try again later\.?/gi, '')
        .trim();
}

function cutSentence(word, offset, sentence, sentenceNum) {
    if (!word) return '';
    sentence = stripPlayerGarbage(sentence);
    // A removed caption can leave the selection on an unrelated player node.
    if (!sentence.includes(word)) return word.replace(/[^\s]+/g, '<b>$&</b>');

    if (sentenceNum > 0) {
        let arr = sentence.match(/((?![.!?;:。！？]['"’”]?\s).|\n)*[.!?;:。！？]['"’”]?(\s|.*$)/g);
        if (arr && arr.length > 1) {
            arr = arr.reduceRight((accumulation, current) => {
                if (current.search(/\.\w{0,3}\.\s$/g) != -1) {
                    accumulation[0] = current + accumulation[0];
                } else {
                    accumulation.unshift(current);
                }
                return accumulation;
            }, ['']);
            arr = arr.filter(x => x.length);
        } else {
            arr = [sentence];
        }

        let index = arr.findIndex(ele => { //try to exactly match to word based on offset.
            if (ele.indexOf(word) !== -1 && ele.searchAll(word).indexOf(offset) != -1)
                return true;
            else
                offset -= ele.length;
        });

        if (index == -1) // fallback if can not exactly find word.
            index = arr.findIndex(ele => ele.indexOf(word) !== -1);

        let left = Math.ceil((sentenceNum - 1) / 2);
        let start = index - left;
        let end = index + ((sentenceNum - 1) - left);

        if (start < 0) {
            start = 0;
            end = sentenceNum - 1;
        } else if (end > (arr.length - 1)) {
            end = arr.length - 1;

            if ((end - (sentenceNum - 1)) < 0) {
                start = 0;
            } else {
                start = end - (sentenceNum - 1);
            }
        }

        return arr.slice(start, end + 1).join('').replaceAll(word, word.replace(/[^\s]+/g,'<b>\$&</b>'));
    } else {
        return sentence.replace(word, word.replace(/[^\s]+/g,'<b>\$&</b>'));
    }
}

if (typeof getAllShadowRoots !== 'function') {
    function getAllShadowRoots(startNode = document) {
        const shadowRoots = [];
        const queue = [startNode];
        const visited = new Set([startNode]);
        while (queue.length > 0) {
            const root = queue.shift();
            let elements = [];
            try {
                elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
            } catch (e) {
                elements = [];
            }
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (el && el.shadowRoot && !visited.has(el.shadowRoot)) {
                    visited.add(el.shadowRoot);
                    shadowRoots.push(el.shadowRoot);
                    queue.push(el.shadowRoot);
                }
            }
        }
        return shadowRoots;
    }
}

function isPlayerContainer(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    // Recognize player roots, not page/layout ancestors that also contain titles and comments.

    const tagName = (node.tagName || node.nodeName || '').toUpperCase();
    if (tagName === 'VIDEO' || tagName === 'AUDIO' || tagName === 'YTD-PLAYER' || tagName === 'YTM-PLAYER') {
        return true;
    }
    const id = (node.id || '').toLowerCase();
    if (['movie_player', 'player', 'video_player', 'video-player'].includes(id)) {
        return true;
    }
    const cl = node.classList;
    if (cl && (
        cl.contains('html5-video-player') ||
        cl.contains('html5-main-video') ||
        cl.contains('video-js') ||
        cl.contains('jwplayer') ||
        cl.contains('shreddit-player') ||
        cl.contains('vjs-tech') ||
        cl.contains('ytp-player-content') ||
        cl.contains('ytp-chrome-bottom') ||
        cl.contains('ytp-chrome-top') ||
        cl.contains('html5-video-container')
    )) {
        return true;
    }
    return false;
}

function isInsidePlayer(node) {
    let cur = node;
    while (cur && cur !== document && cur !== document.body) {
        if (isPlayerContainer(cur)) return true;
        cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host);
    }
    return false;
}

function findMatchingCaptionElement(searchRoot, word) {
    const root = searchRoot || document;
    const allRoots = [root, ...(typeof getAllShadowRoots === 'function' ? getAllShadowRoots(root) : [])];
    const candidates = [];
    const selectors = [
        '#st-captions-container .original-text',
        '#st-captions-container .translation-text',
        '.caption-line--original .original-text',
        '.caption-line--translation .translation-text',
        '.caption-line .original-text',
        '.original-text',
        '.translation-text',
        '.ztsl-translation-insert',
        '.captions-text',
        '.caption-window',
        '.ytp-caption-segment'
    ];
    const selectorStr = selectors.join(', ');

    for (const r of allRoots) {
        try {
            const els = r.querySelectorAll ? r.querySelectorAll(selectorStr) : [];
            for (let i = 0; i < els.length; i++) {
                const el = els[i];
                if (isPlayerContainer(el)) continue;
                const text = (el.textContent || '').trim();
                if (!text) continue;
                if (!word || text.includes(word)) {
                    let score = 1;
                    if (el.classList.contains('original-text')) score += 30;
                    if (el.classList.contains('caption-line--original')) score += 25;
                    if (el.classList.contains('captions-text')) score += 20;
                    if (el.classList.contains('ytp-caption-segment')) score += 18;
                    if (el.classList.contains('caption-window')) score += 15;
                    if (el.classList.contains('translation-text')) score += 10;
                    if (el.closest && el.closest('#st-captions-container')) score += 10;
                    if (word && text.includes(word)) score += 5;
                    candidates.push({ el, score, length: text.length });
                }
            }
        } catch (e) {}
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score || a.length - b.length);
        return candidates[0].el;
    }
    return null;
}

function getSelectedRange() {
    const selection = window.getSelection();
    if (!selection) return null;

    // Deep traverse all open shadow roots (e.g. SelectTranslate hosted inside YouTube player components)
    const allRoots = typeof getAllShadowRoots === 'function' ? getAllShadowRoots(document) : [];
    if (allRoots.length && typeof selection.getComposedRanges === 'function') {
        try {
            const ranges = selection.getComposedRanges({ shadowRoots: allRoots });
            if (ranges.length) {
                const source = ranges[0];
                const startEl = source.startContainer.nodeType === Node.ELEMENT_NODE ?
                    source.startContainer : source.startContainer.parentElement;
                if (!isPlayerContainer(startEl)) {
                    const range = document.createRange();
                    range.setStart(source.startContainer, source.startOffset);
                    range.setEnd(source.endContainer, source.endOffset);
                    return range;
                }
            }
        } catch (e) {}
    }

    // Older Chromium versions expose selection on ShadowRoot instead.
    for (const root of allRoots) {
        if (typeof root.getSelection !== 'function') continue;
        try {
            const inner = root.getSelection();
            if (inner && inner.rangeCount) {
                const range = inner.getRangeAt(0);
                if (range.startContainer.getRootNode() === root) return range;
            }
        } catch (e) {}
    }

    return selection.rangeCount ? selection.getRangeAt(0) : null;
}

function getSelectionOffset(node, range = getSelectedRange()) {
    if (!node || !range) return { start: 0, end: 0 };
    try {
        var clone = range.cloneRange();
        clone.selectNodeContents(node);
        clone.setEnd(range.startContainer, range.startOffset);
        let start = clone.toString().length;
        clone.setEnd(range.endContainer, range.endOffset);
        let end = clone.toString().length;
        return { start, end };
    } catch (e) {
        const text = node.textContent || '';
        const word = (typeof selectedText === 'function' ? selectedText() : range.toString()).trim();
        let start = word ? text.indexOf(word) : 0;
        if (start === -1) start = 0;
        return { start, end: start + (word ? word.length : 0) };
    }
}

function getPDFNode(node) {

    let backwardindex = 0;
    do {
        node = node.parentNode;
    } while (node.name && node.nodeName.toUpperCase() != 'SPAN' && node.nodeName.toUpperCase() != 'DIV');
    let currentspan = node;

    let sentenceNodes = [currentspan];
    let previous = null;
    while ((previous = node.previousSibling)) {
        sentenceNodes.unshift(previous);
        backwardindex += 1;
        if (previous.textContent.search(/[.!?;:。！？]['"’”]?(\s|.*$)/g) != -1)
            break;
        else
            node = previous;
    }

    node = currentspan;
    let next = null;
    while ((next = node.nextSibling)) {
        sentenceNodes.push(next);
        if (node.nextSibling.textContent.search(/[.!?;:。！？]['"’”]?(\s|.*$)/g) != -1)
            break;
        else
            node = next;
    }

    let sentence = '';
    let offset = 0;
    sentenceNodes = sentenceNodes.filter(x => x.textContent != '' || x.textContent != '-');
    for (const node of sentenceNodes) {
        if (backwardindex == 0)
            offset = sentence.length + window.getSelection().getRangeAt(0).startOffset;
        backwardindex -= 1;
        let nodetext = node.textContent;
        if (nodetext == '-')
            sentence = sentence.slice(0, sentence.length-1);
        else
            sentence += (nodetext[nodetext.length - 1] == '-') ? nodetext.slice(0, nodetext.length - 1) : nodetext + ' ';
    }

    return { sentence, offset };
}

function getSentence(sentenceNum) {
    let sentence = '';
    let offset = 0;
    const upNum = 4;

    const range = getSelectedRange();
    if (!range)
        return;
    let word = range.toString().trim();
    const sel = window.getSelection();
    const selText = (sel ? sel.toString() : '').trim();

    let node = range.commonAncestorContainer;
    const element = (node && node.nodeType === Node.ELEMENT_NODE) ? node : (node ? node.parentElement : null);

    const inPlayer = isPlayerContainer(element) || isInsidePlayer(element);

    // If word is empty or range was re-scoped to a player container, recover word from window.getSelection()
    if (!word || inPlayer) {
        if (selText) {
            word = selText;
        }
    }

    if (node && ['INPUT', 'TEXTAREA'].indexOf(node.tagName) !== -1) {
        return;
    }

    if (isPDFJSPage()) {
        let pdfcontext = getPDFNode(node);
        sentence = escapeHtmlTag(pdfcontext.sentence);
        offset = pdfcontext.offset;
    } else {
        // Direct subtitle check from ancestors
        let captionNode = element && (
            element.closest('#st-captions-container .original-text, #st-captions-container .translation-text') ||
            element.closest('.caption-line--original, .caption-line--translation, .subtitles-wrapper') ||
            element.closest('.captions-text, .caption-window') ||
            element.closest('.ytp-caption-segment')
        );

        // Fallback: If node is on or inside a player container, search for matching caption elements
        if (!captionNode && inPlayer) {
            const playerRoot = (element && element.closest && (element.closest('.html5-video-player') || element.closest('ytd-player') || element.closest('#movie_player, #player, #video_player, #video-player'))) || element || document;
            captionNode = findMatchingCaptionElement(playerRoot, word) || findMatchingCaptionElement(document, word);
        }

        if (captionNode) {
            sentence = stripPlayerGarbage(captionNode.textContent || '');
            offset = getSelectionOffset(captionNode, range).start;
        } else if (inPlayer) {
            // Inside player with no caption found: NEVER use player DOM text!
            sentence = escapeHtmlTag(word);
            offset = 0;
        } else {
            node = getWebNode(node, upNum, word);
            if (node && node !== document && !isPlayerContainer(node) && !isInsidePlayer(node)) {
                sentence = stripPlayerGarbage(node.textContent || '');
                offset = getSelectionOffset(node, range).start;
            } else {
                sentence = escapeHtmlTag(word);
                offset = 0;
            }
        }
    }

    return cutSentence(escapeHtmlTag(word), offset, sentence, sentenceNum);
}

function getWebNode(node, deep, word) {
    if (!node || node === document || node === document.body) return node;

    // Never treat a player container or element inside player as a sentence block!
    if (isPlayerContainer(node) || isInsidePlayer(node)) {
        const caption = findMatchingCaptionElement(node, word) || findMatchingCaptionElement(document, word);
        if (caption) return caption;
        return null;
    }

    const blockTags = ['LI', 'P', 'DIV', 'BODY', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
    const nodeName = (node.nodeName || '').toUpperCase();
    // Stop at the comment text itself before its expander's buttons and metadata.
    if (node.nodeType === Node.ELEMENT_NODE && node.matches('#content-text, .comment-renderer-text-content')) return node;
    if (blockTags.includes(nodeName) || deep === 0) {
        return node;
    } else {
        return node.parentElement ? getWebNode(node.parentElement, deep - 1, word) : node;
    }
}

function selectedText() {
    const range = getSelectedRange();
    if (range) {
        const text = range.toString().trim();
        const node = range.commonAncestorContainer;
        const el = (node && node.nodeType === Node.ELEMENT_NODE) ? node : (node ? node.parentElement : null);
        if (!isPlayerContainer(el) && !isInsidePlayer(el) && text) {
            return text;
        }
    }
    const selection = window.getSelection();
    return (selection ? selection.toString() : '').trim();
}

function isValidElement() {
    // if (document.activeElement.getAttribute('contenteditable')) 
    //     return false;

    const invalidTags = ['INPUT', 'TEXTAREA'];
    const nodeName = document.activeElement.nodeName.toUpperCase();
    if (invalidTags.includes(nodeName)) {
        return false;
    } else {
        return true;
    }
}

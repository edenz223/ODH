/* global marked, aiEscapeHtml */
function aiRenderMarkdown(text) {
    // Raw HTML is text, not executable model output. Generated Markdown HTML is
    // sanitized by sanitizeNote before either the popup or Anki receives it.
    const parser = new marked.Marked({
        gfm: true,
        breaks: true,
        renderer: { html: token => aiEscapeHtml(token.text) }
    });
    return '<div class="odh-markdown">' + parser.parse(text) + '</div>';
}

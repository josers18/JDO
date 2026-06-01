/**
 * Pure heuristics for distinguishing plain text vs HTML vs Markdown in LLM
 * output strings. Extracted from dcAgentforceOutputLwc so the regex logic
 * is unit-testable without mounting a Lightning element.
 *
 * No DOM, no Apex, no @api. Plain ES module.
 */

export function looksLikeHtml(s) {
    if (!s || !s.startsWith('<')) {
        return false;
    }
    return (
        /^[\s]*<([a-zA-Z][a-zA-Z0-9]*)[\s>\/]/.test(s) ||
        /^[\s]*<\/[a-zA-Z]/.test(s) ||
        /^[\s]*<!--/.test(s) ||
        (s.includes('</') && s.includes('>'))
    );
}

export function looksLikeMarkdown(s) {
    if (!s) {
        return false;
    }
    if (looksLikeHtml(s)) {
        return false;
    }
    const lines = s.split(/\r?\n/);
    const firstNonEmpty = (lines.find((l) => l.trim()) || '').trim();
    if (/^#{1,6}\s/.test(firstNonEmpty)) {
        return true;
    }
    if (/^```/.test(s.trim())) {
        return true;
    }
    if (/^\s*([-*+]|\d+\.)\s+\S/.test(firstNonEmpty)) {
        return true;
    }
    if (/\*\*[^*\n]+\*\*/.test(s)) {
        return true;
    }
    return false;
}

export function detectFormat(raw) {
    const s = (raw || '').trim();
    if (!s) {
        return 'text';
    }
    if (looksLikeHtml(s)) {
        return 'html';
    }
    if (looksLikeMarkdown(s)) {
        return 'markdown';
    }
    return 'text';
}

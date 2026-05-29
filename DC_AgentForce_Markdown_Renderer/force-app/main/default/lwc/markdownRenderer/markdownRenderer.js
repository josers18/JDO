import { LightningElement, api } from 'lwc';

// Placeholder sentinels — these literal token strings never appear in
// markdown grammar, so they're safe to use as round-trip markers.
const FENCE_TOKEN = 'FENCE';
const INLINE_TOKEN = 'INLINE';

// Tag allowlist for the HTML-input sanitizer path. Matches the tag set the
// markdown parser emits, so both code paths produce the same surface area.
const ALLOWED_TAGS = new Set([
    'p', 'br', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u',
    'ul', 'ol', 'li',
    'blockquote',
    'code', 'pre',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr'
]);

// Per-tag attribute allowlist. Anything not listed gets stripped during
// sanitization. Note: NO style/class/onclick/etc. ever survives.
const ALLOWED_ATTRS = {
    a: ['href']
};

const URL_SAFE_RE = /^(https?:|mailto:|\/|#|\.\/)/i;
const URL_STRIP_RE = /[\s\x00-\x1F\x7F]/g;

export default class MarkdownRenderer extends LightningElement {
    @api value;

    get markdownText() {
        if (!this.value) return '';
        if (typeof this.value === 'string') return this.value;
        return this.value.text || this.value.promptResponse || JSON.stringify(this.value);
    }

    parseMarkdown(text) {
        if (!text) return '';

        // 1. Extract fenced code blocks (```...```) BEFORE escaping.
        //    Preserves their content verbatim; escapes happen at restore time.
        const fences = [];
        let working = text.replace(/```([a-z0-9]*)\n([\s\S]*?)```/gi, (_m, _lang, body) => {
            fences.push(body);
            return `${FENCE_TOKEN}${fences.length - 1}${FENCE_TOKEN}`;
        });

        // 2. Extract inline `code` spans BEFORE escaping (same reason).
        const inlines = [];
        working = working.replace(/`([^`\n]+)`/g, (_m, body) => {
            inlines.push(body);
            return `${INLINE_TOKEN}${inlines.length - 1}${INLINE_TOKEN}`;
        });

        // 3. Escape ALL remaining HTML before inserting any tags.
        let html = this.escapeHtml(working);

        // 4. Tables — must run before paragraph wrapping consumes the newlines.
        html = this._renderTables(html);

        // 5. Headings: ### -> h3, ## -> h2, # -> h1
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // 6. Blockquote: > text — collapse consecutive lines into one block.
        //    Note: > was escaped to &gt; in step 3, so the regex matches the entity.
        html = html.replace(/(?:^&gt; .*(?:\n|$))+/gm, (block) => {
            const inner = block.replace(/^&gt; ?/gm, '').replace(/\n+$/, '');
            return `<blockquote>${inner}</blockquote>`;
        });

        // 7. Bold+italic combo: ***text*** -> <strong><em>text</em></strong>.
        //    Must run before bold-only and italic-only to avoid lazy-match mis-nesting.
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

        // 8. Bold: **text**.
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // 9. Italic: *text*.
        html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

        // 10. Links: [text](url) — scheme allowlist defeats javascript:/data:/vbscript: URIs.
        //     Strip whitespace + control chars (0x00-0x1F + DEL 0x7F) BEFORE scheme matching
        //     so padding like `java\tscript:` cannot bypass the prefix check.
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
            const cleaned = url.replace(/[\s\x00-\x1F\x7F]/g, '');
            const safe = /^(https?:|mailto:|\/|#|\.\/)/i.test(cleaned);
            const href = safe ? cleaned : '#';
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        });

        // 11. Ordered list items: 1. item
        html = html.replace(/^\d+\.\s(.+)$/gm, '<oli>$1</oli>');
        // 12. Unordered list items: - item
        html = html.replace(/^- (.+)$/gm, '<uli>$1</uli>');

        // 13. Wrap consecutive list items
        html = html.replace(/((?:<oli>.*?<\/oli>\s*)+)/g, (m) =>
            `<ol>${m.replaceAll('<oli>', '<li>').replaceAll('</oli>', '</li>')}</ol>`);
        html = html.replace(/((?:<uli>.*?<\/uli>\s*)+)/g, (m) =>
            `<ul>${m.replaceAll('<uli>', '<li>').replaceAll('</uli>', '</li>')}</ul>`);

        // 14. Paragraph + line break handling
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br/>');
        html = '<p>' + html + '</p>';

        // 15. Cleanup
        html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
        html = html.replace(/<p>(<(?:h[1-3]|ul|ol|blockquote|table|pre)>)/g, '$1');
        html = html.replace(/(<\/(?:h[1-3]|ul|ol|blockquote|table|pre)>)<\/p>/g, '$1');
        html = html.replace(/<\/li><br\/><li>/g, '</li><li>');
        html = html.replace(/<(ul|ol)([^>]*)><br\/>/g, '<$1$2>');
        html = html.replace(/<\/(ul|ol)><br\/>/g, '</$1>');

        // 16. Restore code placeholders. Escape content NOW so markdown
        //     inside code blocks renders as literal text.
        html = html.replace(
            new RegExp(`${FENCE_TOKEN}(\\d+)${FENCE_TOKEN}`, 'g'),
            (_m, idx) => `<pre><code>${this.escapeHtml(fences[Number(idx)])}</code></pre>`
        );
        html = html.replace(
            new RegExp(`${INLINE_TOKEN}(\\d+)${INLINE_TOKEN}`, 'g'),
            (_m, idx) => `<code>${this.escapeHtml(inlines[Number(idx)])}</code>`
        );

        return html;
    }

    /**
     * Render GitHub-style tables. Requires header row + separator row
     * (e.g. |---|---|) + at least one body row. Strict separator detection:
     * must contain `-`, may contain `|` `:` and whitespace, nothing else.
     */
    _renderTables(html) {
        return html.replace(
            /^\|(.+)\|\n\|([\s:|-]+)\|\n((?:\|.*\|\n?)+)/gm,
            (full, headerLine, sepLine, bodyLines) => {
                if (!/-/.test(sepLine) || /[^\s:|-]/.test(sepLine)) return full;
                const headers = headerLine.split('|').map((c) => c.trim()).filter(Boolean);
                const bodyRows = bodyLines.trim().split('\n').map((line) =>
                    line.split('|').map((c) => c.trim()).filter(Boolean)
                );
                const ths = headers.map((h) => `<th>${h}</th>`).join('');
                const trs = bodyRows
                    .map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`)
                    .join('');
                return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
            }
        );
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return text.replace(/[&<>"]/g, c => map[c]);
    }

    /**
     * Heuristic: route to the HTML path when the input contains a known
     * structural-HTML tag. The allowlist intentionally excludes <script>
     * and <style> so that a markdown doc containing a stray literal
     * `<script>` continues through the markdown path, where escapeHtml
     * neutralizes it. A code fence containing HTML also stays on the
     * markdown path because the fence is extracted first (step 1) and
     * its content is escaped at restore time (step 16).
     */
    isHtml(text) {
        // Detect any known structural / inline-formatting / interactive HTML
        // tag. Includes both safe tags (p, ul, a, etc.) AND unsafe ones the
        // sanitizer must drop (img, iframe, object, embed). Excludes script
        // and style — those are markdown-friendly to literal-render via escape.
        return /<(?:p|div|span|table|thead|tbody|tr|th|td|h[1-6]|ul|ol|li|blockquote|pre|br|hr|strong|b|em|i|u|code|a|img|iframe|object|embed|video|audio|form|input|button|svg)\b/i.test(text);
    }

    /**
     * Parse `text` as HTML in a detached, inert document, then walk the tree
     * and emit only allowlisted tags with allowlisted attributes. Attribute
     * values on `<a href>` are run through the same URL allowlist used by
     * the markdown link parser; rel/target are force-added.
     */
    sanitizeHtml(text) {
        // Parse into a detached doc — no scripts run, no <img> loads, no
        // event handlers fire. Result is purely structural data we can walk.
        const doc = new DOMParser().parseFromString(text, 'text/html');
        return this._serializeChildren(doc.body);
    }

    _serializeChildren(node) {
        let out = '';
        for (const child of node.childNodes) {
            out += this._serializeNode(child);
        }
        return out;
    }

    _serializeNode(node) {
        // Text nodes: re-escape (browser already decoded entities during parse).
        if (node.nodeType === 3) {
            return this.escapeHtml(node.nodeValue);
        }
        // Anything that isn't an element (comments, CDATA, etc.) is dropped.
        if (node.nodeType !== 1) return '';

        const tag = node.tagName.toLowerCase();
        // Disallowed tag → drop the wrapper, keep the children. This makes
        // <script>foo</script> become "foo" (text-escaped), not vanish entirely
        // for benign nested content.
        if (!ALLOWED_TAGS.has(tag)) {
            // BUT: <script> and <style> contents are themselves dangerous text;
            // for those, drop the contents too.
            if (tag === 'script' || tag === 'style') return '';
            return this._serializeChildren(node);
        }

        // Build attribute string from the per-tag allowlist.
        const allowedAttrs = ALLOWED_ATTRS[tag] || [];
        let attrStr = '';
        for (const attrName of allowedAttrs) {
            const raw = node.getAttribute(attrName);
            if (raw === null) continue;
            const value = this._sanitizeAttrValue(tag, attrName, raw);
            if (value === null) continue;
            attrStr += ` ${attrName}="${this.escapeHtml(value)}"`;
        }

        // Force rel + target on every <a> (mirrors markdown link parser).
        if (tag === 'a') {
            attrStr += ' target="_blank" rel="noopener noreferrer"';
        }

        // Void elements (br, hr) self-close; everything else recurses.
        if (tag === 'br' || tag === 'hr') {
            return `<${tag}${attrStr}/>`;
        }
        return `<${tag}${attrStr}>${this._serializeChildren(node)}</${tag}>`;
    }

    _sanitizeAttrValue(tag, attrName, raw) {
        if (tag === 'a' && attrName === 'href') {
            const cleaned = raw.replace(URL_STRIP_RE, '');
            return URL_SAFE_RE.test(cleaned) ? cleaned : '#';
        }
        return raw;
    }

    renderedCallback() {
        const container = this.template.querySelector('.markdown-container');
        if (container && this.markdownText) {
            const text = this.markdownText;
            const newHtml = this.isHtml(text)
                ? this.sanitizeHtml(text)
                : this.parseMarkdown(text);
            if (container.innerHTML !== newHtml) {
                container.innerHTML = newHtml;
            }
        }
    }
}

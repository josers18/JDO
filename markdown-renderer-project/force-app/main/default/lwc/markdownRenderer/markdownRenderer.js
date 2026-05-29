import { LightningElement, api } from 'lwc';

export default class MarkdownRenderer extends LightningElement {
    @api value;

    _hasRendered = false;

    get markdownText() {
        if (!this.value) return '';
        if (typeof this.value === 'string') return this.value;
        return this.value.text || this.value.promptResponse || JSON.stringify(this.value);
    }

    parseMarkdown(text) {
        if (!text) return '';
        let html = this.escapeHtml(text);

        // Headings: ### -> h3, ## -> h2, # -> h1
        html = html.replace(/^### (.+)$/gm,
            '<h3 style="font-size:1rem;font-weight:700;margin:0.75rem 0 0.25rem 0;color:#181818;">$1</h3>');
        html = html.replace(/^## (.+)$/gm,
            '<h2 style="font-size:1.125rem;font-weight:700;margin:0.75rem 0 0.25rem 0;color:#181818;">$1</h2>');
        html = html.replace(/^# (.+)$/gm,
            '<h1 style="font-size:1.25rem;font-weight:700;margin:0.75rem 0 0.25rem 0;color:#181818;">$1</h1>');

        // Bold: **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic: *text* (not preceded/followed by *)
        html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

        // Links: [text](url) -- scheme allowlist defeats javascript:/data:/vbscript: URIs.
        // Strip whitespace + control chars (0x00-0x1F + DEL 0x7F) BEFORE scheme matching
        // so padding like `java\tscript:` cannot bypass the prefix check.
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
            const cleaned = url.replace(/[\s\x00-\x1F\x7F]/g, '');
            const safe = /^(https?:|mailto:|\/|#|\.\/)/i.test(cleaned);
            const href = safe ? cleaned : '#';
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#0070d2;text-decoration:underline;">${label}</a>`;
        });

        // Unordered list items: - item
        html = html.replace(/^- (.+)$/gm,
            '<li style="margin-bottom:0.25rem;margin-left:1.25rem;list-style-type:disc;">$1</li>');

        // Wrap consecutive <li> elements in <ul>
        html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g,
            '<ul style="padding-left:0.5rem;margin:0.5rem 0;">$1</ul>');

        // Double newline -> paragraph break
        html = html.replace(/\n\n/g, '</p><p style="margin:0.5rem 0;line-height:1.5;">');

        // Single newline (not inside tags) -> <br>
        html = html.replace(/\n/g, '<br/>');

        // Wrap in paragraph
        html = '<p style="margin:0.5rem 0;line-height:1.5;">' + html + '</p>';

        // Clean up empty paragraphs and stray <br> inside lists
        html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
        html = html.replace(/<ul([^>]*)><br\/>/g, '<ul$1>');
        html = html.replace(/<\/ul><br\/>/g, '</ul>');

        return html;
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return text.replace(/[&<>"]/g, c => map[c]);
    }

    renderedCallback() {
        const container = this.template.querySelector('.markdown-container');
        if (container && this.markdownText) {
            const newHtml = this.parseMarkdown(this.markdownText);
            if (container.innerHTML !== newHtml) {
                container.innerHTML = newHtml;
            }
        }
    }
}

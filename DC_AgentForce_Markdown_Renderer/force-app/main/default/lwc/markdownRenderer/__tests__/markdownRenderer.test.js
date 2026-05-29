import { createElement } from 'lwc';
import MarkdownRenderer from 'c/markdownRenderer';

function mount(value) {
    const el = createElement('c-markdown-renderer', { is: MarkdownRenderer });
    el.value = value;
    document.body.appendChild(el);
    return el;
}

// LWC injects shadow-scope attributes (e.g. ` lwc-abc123=""`) onto every
// emitted element. Strip them so test assertions can match canonical tags.
function html(el) {
    return el.shadowRoot
        .querySelector('.markdown-container')
        .innerHTML.replace(/\s+lwc-[a-z0-9]+=""/g, '');
}

describe('escapeHtml', () => {
    it('escapes HTML control chars before any markdown regex runs', () => {
        const el = mount('<script>alert(1)</script>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).not.toContain('<script>');
            expect(out).toContain('&lt;script&gt;');
        });
    });

    it('escapes &amp; &lt; &gt; in parsed markdown text', () => {
        const el = mount('Compare A & B < C > D');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('A &amp; B');
            expect(out).toContain('&lt; C');
            expect(out).toContain('&gt; D');
        });
    });
});

describe('URL allowlist (security-critical)', () => {
    // The renderer must reject javascript:, data:, vbscript:, and any padded
    // variant (java\tscript:, java\nscript:, etc.) by collapsing href to "#".
    // Browsers' URL parser ignores intra-scheme whitespace, so the allowlist
    // MUST run after stripping control chars from the URL.

    const REJECTED_SCHEMES = [
        ['plain javascript', '[click](javascript:alert(1))'],
        ['javascript with tab padding', '[click](java\tscript:alert(1))'],
        ['javascript with newline padding', '[click](java\nscript:alert(1))'],
        ['javascript with leading whitespace', '[click](  javascript:alert(1))'],
        ['javascript uppercase', '[click](JAVASCRIPT:alert(1))'],
        ['javascript mixed case', '[click](JaVaScRiPt:alert(1))'],
        ['data URI text/html', '[click](data:text/html,<script>alert(1)</script>)'],
        ['data URI base64', '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
        ['vbscript URI', '[click](vbscript:msgbox(1))'],
        ['file URI', '[click](file:///etc/passwd)'],
        ['ftp URI', '[click](ftp://example.com/path)']
    ];

    REJECTED_SCHEMES.forEach(([label, input]) => {
        it(`rejects ${label} -> href="#"`, () => {
            const el = mount(input);
            return Promise.resolve().then(() => {
                const out = html(el);
                expect(out).toContain('href="#"');
                expect(out).not.toContain('javascript:');
                expect(out).not.toContain('data:');
                expect(out).not.toContain('vbscript:');
            });
        });
    });

    const ACCEPTED_SCHEMES = [
        ['https', '[click](https://example.com/path?q=1)', 'https://example.com/path?q=1'],
        ['http', '[click](http://example.com)', 'http://example.com'],
        ['mailto', '[email](mailto:a@b.com)', 'mailto:a@b.com'],
        ['relative path', '[home](/home)', '/home'],
        ['fragment', '[anchor](#section)', '#section'],
        ['relative dot', '[file](./page.html)', './page.html']
    ];

    ACCEPTED_SCHEMES.forEach(([label, input, expectedHref]) => {
        it(`preserves ${label}`, () => {
            const el = mount(input);
            return Promise.resolve().then(() => {
                expect(html(el)).toContain(`href="${expectedHref}"`);
            });
        });
    });

    it('emits rel="noopener noreferrer" on every link', () => {
        const el = mount('[link](https://example.com)');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('rel="noopener noreferrer"');
        });
    });

    it('opens links in new tab via target="_blank"', () => {
        const el = mount('[link](https://example.com)');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('target="_blank"');
        });
    });
});

describe('markdown constructs', () => {
    it('renders headings h1-h3', () => {
        const el = mount('# H1\n## H2\n### H3');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<h1>H1</h1>');
            expect(out).toContain('<h2>H2</h2>');
            expect(out).toContain('<h3>H3</h3>');
        });
    });

    it('renders bold and italic', () => {
        const el = mount('**bold** and *italic*');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<strong>bold</strong>');
            expect(out).toContain('<em>italic</em>');
        });
    });

    it('renders triple-asterisk as bold+italic', () => {
        const el = mount('***both***');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('<strong><em>both</em></strong>');
        });
    });

    it('renders unordered lists', () => {
        const el = mount('- a\n- b\n- c');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<ul>');
            expect(out).toContain('<li>a</li>');
            expect(out).toContain('<li>b</li>');
            expect(out).toContain('<li>c</li>');
            expect(out).toContain('</ul>');
        });
    });

    it('renders ordered lists', () => {
        const el = mount('1. one\n2. two\n3. three');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<ol>');
            expect(out).toContain('<li>one</li>');
            expect(out).toContain('<li>two</li>');
            expect(out).toContain('<li>three</li>');
            expect(out).toContain('</ol>');
        });
    });

    it('renders blockquotes', () => {
        const el = mount('> first\n> second');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<blockquote>');
            expect(out).toContain('first');
            expect(out).toContain('second');
            expect(out).toContain('</blockquote>');
        });
    });

    it('renders inline code', () => {
        const el = mount('Use `console.log()` to debug.');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('<code>console.log()</code>');
        });
    });

    it('renders fenced code blocks and preserves markdown literals inside', () => {
        const el = mount('```js\nconst x = **not bold**;\n```');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<pre><code>');
            expect(out).toContain('**not bold**');
            expect(out).not.toContain('<strong>not bold</strong>');
        });
    });

    it('escapes HTML inside fenced code blocks', () => {
        const el = mount('```\n<script>alert(1)</script>\n```');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('&lt;script&gt;');
            expect(out).not.toContain('<script>alert(1)</script>');
        });
    });

    it('renders github-flavored tables', () => {
        const el = mount('| col1 | col2 |\n|------|------|\n| a    | b    |\n| c    | d    |');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<table>');
            expect(out).toContain('<th>col1</th>');
            expect(out).toContain('<th>col2</th>');
            expect(out).toContain('<td>a</td>');
            expect(out).toContain('<td>d</td>');
        });
    });
});

describe('value getter', () => {
    it('handles plain string', () => {
        const el = mount('plain string');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('plain string');
        });
    });

    it('unwraps object with text property', () => {
        const el = mount({ text: '**bold**' });
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('<strong>bold</strong>');
        });
    });

    it('unwraps object with promptResponse property (Agentforce shape)', () => {
        const el = mount({ promptResponse: '## Heading' });
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('<h2>Heading</h2>');
        });
    });

    it('falls back to JSON.stringify for unknown shapes', () => {
        const el = mount({ unknown: 'shape', n: 42 });
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('unknown');
            expect(out).toContain('42');
        });
    });

    it('renders nothing when value is null/undefined', () => {
        const el = mount(null);
        return Promise.resolve().then(() => {
            expect(html(el)).toBe('');
        });
    });
});

describe('HTML input path (auto-detect + sanitize)', () => {
    // When the input is HTML rather than markdown, it goes through the
    // DOMParser-based sanitizer instead of the markdown regex pipeline.
    // Both code paths emit the same allowlisted tag set.

    it('detects and renders simple HTML', () => {
        const el = mount('<p>This is <strong>HTML</strong>.</p>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<p>');
            expect(out).toContain('<strong>HTML</strong>');
        });
    });

    it('strips disallowed tags but keeps inner content', () => {
        // <div> isn't in the allowlist; its content should survive as text.
        const el = mount('<div>Important text</div>');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('Important text');
        });
    });

    it('drops <script> tags AND their contents', () => {
        const el = mount('<p>Safe <script>alert(1)</script> text</p>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).not.toContain('<script>');
            expect(out).not.toContain('alert(1)');
            expect(out).toContain('Safe');
            expect(out).toContain('text');
        });
    });

    it('drops <style> tags AND their contents', () => {
        const el = mount('<style>body { background: red }</style><p>Hi</p>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).not.toContain('<style>');
            expect(out).not.toContain('background');
        });
    });

    it('strips event handler attributes', () => {
        const el = mount('<p onclick="alert(1)">click</p>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).not.toContain('onclick');
            expect(out).not.toContain('alert');
        });
    });

    it('strips style attributes', () => {
        const el = mount('<p style="color:red">red text</p>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).not.toContain('style=');
            expect(out).not.toContain('color:red');
        });
    });

    it('strips class and id attributes', () => {
        const el = mount('<p class="evil" id="x">text</p>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).not.toContain('class=');
            expect(out).not.toContain('id=');
        });
    });

    it('preserves href on anchor + URL allowlist applies', () => {
        const el = mount('<a href="https://example.com">link</a>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('href="https://example.com"');
            expect(out).toContain('rel="noopener noreferrer"');
            expect(out).toContain('target="_blank"');
        });
    });

    it('rejects javascript: URI on anchor href', () => {
        const el = mount('<a href="javascript:alert(1)">click</a>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('href="#"');
            expect(out).not.toContain('javascript:');
        });
    });

    it('rejects padded javascript: URI on anchor href', () => {
        const el = mount('<a href="java\tscript:alert(1)">click</a>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('href="#"');
            expect(out).not.toContain('javascript:');
        });
    });

    it('rejects data: URI on anchor href', () => {
        const el = mount('<a href="data:text/html,<script>alert(1)</script>">click</a>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('href="#"');
            expect(out).not.toContain('data:');
        });
    });

    it('drops <img> with onerror payload', () => {
        const el = mount('<img src=x onerror="alert(1)">text');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).not.toContain('<img');
            expect(out).not.toContain('onerror');
            expect(out).not.toContain('alert');
        });
    });

    it('drops <iframe>', () => {
        const el = mount('<iframe src="https://evil.com"></iframe>');
        return Promise.resolve().then(() => {
            expect(html(el)).not.toContain('<iframe');
        });
    });

    it('preserves nested allowlisted tags', () => {
        const el = mount('<ul><li><strong>a</strong></li><li><em>b</em></li></ul>');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<ul>');
            expect(out).toContain('<li><strong>a</strong></li>');
            expect(out).toContain('<li><em>b</em></li>');
        });
    });

    it('preserves HTML tables', () => {
        const html_input = '<table><thead><tr><th>A</th><th>B</th></tr></thead>'
            + '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
        const el = mount(html_input);
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<table>');
            expect(out).toContain('<th>A</th>');
            expect(out).toContain('<td>2</td>');
        });
    });

    it('escapes text content (e.g. & in body)', () => {
        const el = mount('<p>A & B</p>');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('A &amp; B');
        });
    });

    it('handles plain text mixed into a known-html string', () => {
        // Detected as HTML because of the <p>; surrounding text is escaped.
        const el = mount('Lead text <p>paragraph</p> trailing & more');
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('Lead text');
            expect(out).toContain('<p>paragraph</p>');
            expect(out).toContain('trailing &amp; more');
        });
    });

    it('plain markdown still goes through the markdown path (not HTML)', () => {
        // No HTML tag pattern → markdown path; ** must convert to <strong>.
        const el = mount('**not html, just markdown**');
        return Promise.resolve().then(() => {
            expect(html(el)).toContain('<strong>not html, just markdown</strong>');
        });
    });
});

describe('edge cases', () => {
    it('handles empty input', () => {
        const el = mount('');
        return Promise.resolve().then(() => {
            expect(html(el)).toBe('');
        });
    });

    it('handles a complex multi-construct response', () => {
        const md = [
            '# Product Offers',
            '',
            'Here are **two** offers for you:',
            '',
            '1. Premium Card — *low APR*',
            '2. Basic Card — `no annual fee`',
            '',
            '> Talk to your advisor for details.',
            '',
            '[Learn more](https://example.com)'
        ].join('\n');
        const el = mount(md);
        return Promise.resolve().then(() => {
            const out = html(el);
            expect(out).toContain('<h1>Product Offers</h1>');
            expect(out).toContain('<strong>two</strong>');
            expect(out).toContain('<ol>');
            expect(out).toContain('<em>low APR</em>');
            expect(out).toContain('<code>no annual fee</code>');
            expect(out).toContain('<blockquote>');
            expect(out).toContain('href="https://example.com"');
        });
    });
});

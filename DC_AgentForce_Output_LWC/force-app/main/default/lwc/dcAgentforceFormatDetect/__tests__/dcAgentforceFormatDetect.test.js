import {
    detectFormat,
    looksLikeHtml,
    looksLikeMarkdown
} from 'c/dcAgentforceFormatDetect';

describe('looksLikeHtml', () => {
    it('returns true for a string starting with an opening tag', () => {
        expect(looksLikeHtml('<p>hello</p>')).toBe(true);
    });

    it('returns true for a string starting with a closing tag', () => {
        expect(looksLikeHtml('</section>trailing text')).toBe(true);
    });

    it('returns false for plain text that contains angle brackets', () => {
        expect(looksLikeHtml('5 < 7 and 8 > 6')).toBe(false);
    });

    it('returns false for markdown that does not start with <', () => {
        expect(looksLikeHtml('# Heading\nand body')).toBe(false);
    });
});

describe('looksLikeMarkdown', () => {
    it('detects an ATX heading on the first non-empty line', () => {
        expect(looksLikeMarkdown('# Title\n\nbody')).toBe(true);
    });

    it('detects a fenced code block', () => {
        expect(looksLikeMarkdown('```js\nconst x = 1;\n```')).toBe(true);
    });

    it('detects a leading list bullet', () => {
        expect(looksLikeMarkdown('- first\n- second')).toBe(true);
    });

    it('detects an ordered-list marker', () => {
        expect(looksLikeMarkdown('1. step one\n2. step two')).toBe(true);
    });

    it('detects bold emphasis anywhere in the body', () => {
        expect(looksLikeMarkdown('regular text with **emphasis** in it')).toBe(true);
    });

    it('returns false for plain prose with no markdown markers', () => {
        expect(looksLikeMarkdown('Just a sentence with no formatting.')).toBe(false);
    });

    it('returns false when the input is HTML (delegates to looksLikeHtml)', () => {
        expect(looksLikeMarkdown('<article># not a heading</article>')).toBe(false);
    });
});

describe('detectFormat', () => {
    it('returns "text" for empty input', () => {
        expect(detectFormat('')).toBe('text');
    });

    it('returns "text" for null input', () => {
        expect(detectFormat(null)).toBe('text');
    });

    it('returns "html" when the string opens with a tag', () => {
        expect(detectFormat('<div>hi</div>')).toBe('html');
    });

    it('returns "markdown" for a string with a leading heading', () => {
        expect(detectFormat('## Section\nbody')).toBe('markdown');
    });

    it('returns "text" for plain prose', () => {
        expect(detectFormat('plain text without any formatting')).toBe('text');
    });

    it('prefers "html" over "markdown" when both signals are present', () => {
        expect(detectFormat('<div># inside\n- bullet</div>')).toBe('html');
    });
});

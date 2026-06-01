/**
 * Shared service module for clipboard write + print/PDF helpers used by
 * dcAgentforceOutputLwc and dcAgentforceOutputModal. Extracted to keep the two
 * bundles in lockstep — fixing a clipboard quirk in one would otherwise drift.
 *
 * Service modules in LWC are plain ES modules (no LightningElement export).
 * isExposed=false in the meta-xml so it doesn't show up in App Builder.
 */

/**
 * HTML-escape for both element-text and attribute-value contexts.
 * Escapes &, <, >, ", and ' so the result is safe in either position.
 */
export function escapeForHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Tag/attribute allowlist for sanitizing marked.parse() output. Matches the
// surface area lightning-formatted-rich-text accepts on display, so the same
// payload is safe for both display AND print (which bypasses LFRT entirely).
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

const ALLOWED_ATTRS = {
    a: ['href']
};

const URL_SAFE_RE = /^(https?:|mailto:|\/|#|\.\/)/i;
const URL_STRIP_RE = /[\s\x00-\x1F\x7F]/g;

/**
 * Allowlist-sanitize HTML produced by marked.parse(). Strips disallowed tags
 * (preserves their text), strips disallowed attributes, and rejects href
 * schemes that aren't http(s)/mailto/relative — closes the javascript: /
 * data: / vbscript: surface. Uses a detached DOMParser so no scripts run
 * during parsing.
 *
 * Designed to be idempotent: sanitize(sanitize(x)) === sanitize(x).
 */
export function sanitizeRichHtml(html) {
    if (html == null || html === '') {
        return '';
    }
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    if (!doc || !doc.body) {
        return '';
    }
    sanitizeNode(doc.body);
    return doc.body.innerHTML;
}

function sanitizeNode(root) {
    const toUnwrap = [];
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let node = walker.nextNode();
    while (node) {
        const tag = node.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
            toUnwrap.push(node);
        } else {
            const allowedAttrs = ALLOWED_ATTRS[tag] || [];
            for (const attr of Array.from(node.attributes)) {
                if (!allowedAttrs.includes(attr.name.toLowerCase())) {
                    node.removeAttribute(attr.name);
                    continue;
                }
                if (attr.name.toLowerCase() === 'href') {
                    const cleaned = String(attr.value).replace(URL_STRIP_RE, '');
                    if (!URL_SAFE_RE.test(cleaned)) {
                        node.removeAttribute('href');
                    } else {
                        node.setAttribute('href', cleaned);
                    }
                }
            }
        }
        node = walker.nextNode();
    }
    // Unwrap disallowed elements (replace with their text/children) in
    // reverse-DOM order so child unwrap doesn't disturb parent walking.
    for (let i = toUnwrap.length - 1; i >= 0; i--) {
        const el = toUnwrap[i];
        const parent = el.parentNode;
        if (!parent) {
            continue;
        }
        while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
    }
}

/**
 * Build a self-contained HTML page for printing the prompt output.
 * `effectiveFormat` is one of 'text' | 'html' | 'markdown' (matches the
 * parent's effectiveOutputFormat); rich formats inject `richHtml` as-is
 * (already sanitized via lightning-formatted-rich-text upstream); 'text'
 * mode HTML-escapes the body.
 */
export function buildPrintHtml(title, body, effectiveFormat, richHtml) {
    const t = escapeForHtml(title);
    const fmt = effectiveFormat || 'text';
    const rich = richHtml || '';
    const bodyBlock = fmt === 'text'
        ? '<pre>' + escapeForHtml(body) + '</pre>'
        : '<div class="rich">' + rich + '</div>';
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' +
        t +
        '</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:24px;line-height:1.5;}h1{font-size:18px;margin-bottom:16px;}pre{white-space:pre-wrap;word-break:break-word;font-size:14px;}.rich{font-size:14px;line-height:1.55;}</style></head><body><h1>' +
        t +
        '</h1>' +
        bodyBlock +
        '</body></html>'
    );
}

/**
 * Copy via a pre-declared <textarea lwc:ref="copyBuffer">. Returns true on success.
 * The textarea must exist in the caller's template; pass the dereferenced ref.
 */
export function copyWithTemplateTextarea(ta, value) {
    if (!ta) {
        return false;
    }
    try {
        ta.removeAttribute('readonly');
        ta.value = value;
        ta.focus();
        ta.select();
        if (value.length > 0) {
            ta.setSelectionRange(0, value.length);
        }
        const ok = document.execCommand('copy');
        ta.value = '';
        ta.setAttribute('readonly', '');
        return !!ok;
    } catch (ignore) {
        try {
            ta.value = '';
            ta.setAttribute('readonly', '');
        } catch (e2) {
            // ignore
        }
        return false;
    }
}

/**
 * Three-tier clipboard write: navigator.clipboard → template textarea → dynamic textarea.
 * Lightning Locker / iframe policies often block the first; the template-textarea path
 * is the most reliable in flexipages. Throws on total failure so callers can show a
 * "copy manually" fallback modal.
 *
 * @param {Element} hostTemplate  this.template (host node for the dynamic-textarea fallback)
 * @param {Element|null} bufferTextarea  pre-declared textarea ref, may be null
 * @param {string} text  value to copy
 */
export async function writeClipboard(hostTemplate, bufferTextarea, text) {
    const value = text == null ? '' : String(text);
    if (value.length === 0) {
        throw new Error('Nothing to copy');
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch (ignore) {
            // Locker / iframe — try fallbacks
        }
    }
    if (copyWithTemplateTextarea(bufferTextarea, value)) {
        return;
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    hostTemplate.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    hostTemplate.removeChild(ta);
    if (!ok) {
        throw new Error('Copy command was rejected');
    }
}

/**
 * Try to print via a hidden iframe declared in the caller's template with
 * [data-print-frame]. Uses iframe.srcdoc (the modern alternative to document.write)
 * and waits for the iframe's load event before invoking print() — avoids the timing
 * race where print() fires against an empty document. Returns a Promise<boolean>.
 *
 * After the print dialog opens, srcdoc is cleared on a 1-second timer so the
 * generated content (which may include record data) doesn't sit in the DOM
 * for the lifetime of the parent component.
 */
export function tryPrintWithIframe(hostTemplate, html) {
    return new Promise((resolve) => {
        const iframe = hostTemplate.querySelector('[data-print-frame]');
        if (!iframe || !iframe.contentWindow) {
            resolve(false);
            return;
        }
        const clearLater = () => {
            // 1s gives the print dialog time to capture the document; longer is
            // overkill, shorter races the dialog open in slow browsers.
            window.setTimeout(() => {
                try {
                    iframe.srcdoc = '';
                } catch (ignore) {
                    // ignore
                }
            }, 1000);
        };
        const onLoad = () => {
            iframe.removeEventListener('load', onLoad);
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                clearLater();
                resolve(true);
            } catch (ignore) {
                clearLater();
                resolve(false);
            }
        };
        try {
            iframe.addEventListener('load', onLoad);
            iframe.srcdoc = html;
        } catch (ignore) {
            iframe.removeEventListener('load', onLoad);
            resolve(false);
        }
    });
}

/**
 * Fallback: open the print HTML in a new window via Blob URL. Returns true if the
 * popup opened. The window keeps a usable reference to call print() — do NOT pass
 * 'noopener' to window.open or the print() call fails in some browsers.
 */
export function tryPrintWithBlobUrl(html) {
    let url;
    try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) {
            URL.revokeObjectURL(url);
            return false;
        }
        const cleanup = () => {
            try {
                URL.revokeObjectURL(url);
            } catch (ignore) {
                // ignore
            }
        };
        const runPrint = () => {
            try {
                w.focus();
                w.print();
            } catch (ignore) {
                // ignore
            }
            window.setTimeout(cleanup, 120000);
        };
        // Blob-URL popups don't reliably fire a load event; 300ms is empirically
        // long enough for the document to render but short enough that the user
        // doesn't notice a delay before the print dialog opens. Don't drop this
        // — calling print() against an empty document produces a blank preview.
        window.setTimeout(runPrint, 300);
        return true;
    } catch (ignore) {
        if (url) {
            try {
                URL.revokeObjectURL(url);
            } catch (e2) {
                // ignore
            }
        }
        return false;
    }
}

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
 */
export function tryPrintWithIframe(hostTemplate, html) {
    return new Promise((resolve) => {
        const iframe = hostTemplate.querySelector('[data-print-frame]');
        if (!iframe || !iframe.contentWindow) {
            resolve(false);
            return;
        }
        const onLoad = () => {
            iframe.removeEventListener('load', onLoad);
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                resolve(true);
            } catch (ignore) {
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

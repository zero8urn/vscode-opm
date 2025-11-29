/**
 * Minimal, swappable HTML sanitizer for webviews.
 *
 * - Lightweight default implementation that strips obviously dangerous tags and attributes.
 * - Provides `setSanitizer` to swap in a third-party sanitizer (e.g., DOMPurify/isomorphic-dompurify).
 * - Keep behaviour conservative: remove <script>, event handlers, javascript: URIs, and optionally strip images/styles.
 */

export type SanitizerOptions = {
  allowImages?: boolean;
  allowLinks?: boolean; // currently not used but kept for API compatibility
  allowStyles?: boolean;
};

export type SanitizerFn = (html: string, options?: SanitizerOptions) => string;

let currentSanitizer: SanitizerFn = createDefaultSanitizer();

export function setSanitizer(fn: SanitizerFn) {
  currentSanitizer = fn;
}

export function getSanitizer(): SanitizerFn {
  return currentSanitizer;
}

export function sanitizeHtml(html: string, options?: SanitizerOptions): string {
  return currentSanitizer(html, options);
}

export function createDefaultSanitizer(): SanitizerFn {
  return (input: string, options?: SanitizerOptions) => {
    let s = String(input || '');

    // Remove dangerous element types entirely (script, iframe, embed, object, form, meta, base)
    s = s.replace(/<\s*(script|iframe|object|embed|form|meta|base)[\s\S]*?>[\s\S]*?<\/\1\s*>/gi, '');
    s = s.replace(/<\s*(script|iframe|object|embed|form|meta|base)[^>]*\/\s*>/gi, '');

    // Remove event handler attributes (onclick, onerror, etc.)
    s = s.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Remove style attributes unless explicitly allowed
    if (!(options && options.allowStyles)) {
      s = s.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    }

    // Neutralize javascript: protocol in href/src attributes
    s = s.replace(/\s(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, ' $1="#"');
    s = s.replace(/\s(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"');

    // Block data: and vbscript: URIs in href/src (images may rely on data:, but default is to block)
    s = s.replace(/\s(href|src)\s*=\s*("|')\s*(data:|vbscript:)[^"']*\2/gi, ' $1="#"');

    // Optionally remove images (replace with alt text where available)
    if (!(options && options.allowImages)) {
      s = s.replace(/<img\b[^>]*alt=(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (_m, a1, a2, a3) => {
        const text = a1 || a2 || a3 || '';
        return text ? `<span>${text}</span>` : '';
      });
      s = s.replace(/<img\b[^>]*>/gi, '');
    }

    return s;
  };
}

// Export default instance convenience
export const defaultSanitizer = getSanitizer();

export default sanitizeHtml;

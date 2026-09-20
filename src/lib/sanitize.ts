import sanitizeHtml from 'sanitize-html';

/**
 * Comment text in a Spectora export is rich text: paragraphs, bold, italics,
 * lists and the occasional link. We keep that formatting, because an inspector
 * wrote it deliberately and flattening it would change their report. Everything
 * else (scripts, styles, event handlers, iframes, inline CSS) is dropped, since
 * this HTML is rendered straight into our own pages.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'a', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'sub', 'sup',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

export function sanitizeCommentHtml(input: string): string {
  if (!input) return '';
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  }).trim();
}

/** Plain-text version of the same content, used for search and plain exports. */
export function htmlToText(input: string): string {
  if (!input) return '';
  const withBreaks = input
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** True when the string carries markup we need to preserve. */
export function hasMarkup(input: string): boolean {
  return /<[a-z][\s\S]*>/i.test(input ?? '');
}

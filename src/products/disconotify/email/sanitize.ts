import 'server-only';
import sanitizeHtml from 'sanitize-html';

/** Allow-list sanitizer for template bodies and the layout footer. Runs on save and again for every preview. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'center'],
  allowedAttributes: {
    a: ['href', 'title', 'style', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    td: ['colspan', 'rowspan', 'align', 'valign', 'width', 'style'], th: ['colspan', 'rowspan', 'align', 'valign', 'width', 'style'],
    table: ['width', 'cellpadding', 'cellspacing', 'align', 'role', 'style'],
    '*': ['style', 'align'],
  },
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i], 'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
      'text-align': [/^(left|right|center)$/], 'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/], 'font-weight': [/^(normal|bold|\d{3})$/],
      'font-style': [/^(normal|italic)$/], 'text-decoration': [/^(none|underline)$/], 'line-height': [/^\d+(\.\d+)?(px|em|%)?$/],
      padding: [/^[\d\s.px%em]+$/], margin: [/^[\d\s.px%em-]+$/], 'border-radius': [/^[\d\s.px%]+$/], border: [/^[\w\s#.%(),-]+$/],
      display: [/^(block|inline-block|inline)$/], width: [/^\d+(\.\d+)?(px|%)$/], 'max-width': [/^\d+(\.\d+)?(px|%)$/], height: [/^\d+(\.\d+)?px$/],
    },
  },
  transformTags: { a: (tag, attribs) => ({ tagName: tag, attribs: { ...attribs, rel: 'noopener noreferrer' } }) },
  disallowedTagsMode: 'discard',
};

export function sanitizeEmailHtml(html: string): string {
  // A bare {{{x_url}}} href is not a valid URL, so swap it for a placeholder while sanitizing and put it back after.
  const kept: string[] = [];
  const guarded = html.replace(/\bhref\s*=\s*(["'])(\s*\{\{\{\s*\w+\s*\}\}\}\s*)\1/gi, (_m, q: string, v: string) => { kept.push(v.trim()); return `href=${q}https://placeholder.invalid/${kept.length - 1}${q}`; });
  const clean = sanitizeHtml(guarded, OPTIONS);
  return clean.replace(/https:\/\/placeholder\.invalid\/(\d+)/g, (_m, i: string) => kept[Number(i)] ?? '');
}

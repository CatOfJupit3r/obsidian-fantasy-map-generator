/**
 * What FMG's page may load and where its data may go. FMG runs `new Function` on the goods code of a map, so scripts
 * need `unsafe-eval`; the rest keeps a map from sending data anywhere but the font hosts FMG's exports read.
 */
const FONT_STYLE_HOST = 'https://fonts.googleapis.com';
const FONT_FILE_HOST = 'https://fonts.gstatic.com';

const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'", FONT_STYLE_HOST],
  'font-src': ["'self'", 'data:', FONT_FILE_HOST],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'data:', 'blob:', FONT_FILE_HOST, FONT_STYLE_HOST],
  'worker-src': ["'self'", 'blob:'],
} satisfies Record<string, string[]>;

export function buildContentSecurityPolicy(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

const HEAD_OPEN_PATTERN = /<head(?:\s[^>]*)?>/iu;

/** The page with the policy as the first element of its head, so it covers every script and style after it. */
export function injectContentSecurityPolicy(html: string): string {
  const head = HEAD_OPEN_PATTERN.exec(html);
  if (!head) throw new Error('The FMG page has no <head> to put the content security policy in.');

  const meta = `\n  <meta http-equiv="Content-Security-Policy" content="${buildContentSecurityPolicy()}" />`;
  return html.slice(0, head.index + head[0].length) + meta + html.slice(head.index + head[0].length);
}

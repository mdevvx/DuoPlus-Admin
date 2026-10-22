import type { ButtonStyle } from './button';

/**
 * Works on the email body as a list of top-level blocks (paragraphs, tables, buttons …), so a block can be moved,
 * edited or removed without rewriting the rest. Blocks are cut from the original text, never re-serialised, so
 * nothing else in the body changes. Pure string code: it runs in the editor and in tests.
 */
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
const TAG = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;

export function splitBlocks(html: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  const push = (end: number) => { const b = html.slice(start, end).trim(); if (b) blocks.push(b); start = end; };
  for (const m of html.matchAll(TAG)) {
    const at = m.index ?? 0;
    const name = m[2]!.toLowerCase();
    const closing = m[1] === '/';
    const selfClosing = m[3] === '/' || VOID.has(name);
    if (depth === 0 && !closing) push(at); // text before a new top-level tag is its own block
    if (closing) depth = Math.max(0, depth - 1);
    else if (!selfClosing) depth++;
    if (depth === 0) push(at + m[0].length);
  }
  push(html.length);
  return blocks;
}

const join = (blocks: string[]) => blocks.join('\n');

export interface ButtonSpec { text: string; href: string; style: ButtonStyle; color: string; align: 'left' | 'center' }

const unescapeHtml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const BUTTON = /^<p style="text-align:(left|center);margin:20px 0"><a href="([^"]*)" style="display:inline-block;padding:12px 26px;border-radius:8px;([^"]*?);text-decoration:none;font-weight:600">([\s\S]*?)<\/a><\/p>$/;

/** Reads back a button made by buttonHtml(). Anything else (hand-written HTML) is not a button block. */
export function parseButton(block: string): ButtonSpec | null {
  const m = BUTTON.exec(block.trim());
  if (!m) return null;
  const look = m[3]!;
  const filled = /^background-color:(#[0-9a-fA-F]{6});/.exec(look);
  const outline = /^color:(#[0-9a-fA-F]{6});/.exec(look);
  const color = filled?.[1] ?? outline?.[1];
  if (!color) return null;
  return { text: unescapeHtml(m[4]!), href: m[2]!, style: filled ? 'filled' : 'outline', color, align: m[1] as 'left' | 'center' };
}

export interface ButtonBlock { index: number; count: number; spec: ButtonSpec }

/** The buttons in the body with their position among all blocks (for the move up/down controls). */
export function listButtons(html: string): ButtonBlock[] {
  const blocks = splitBlocks(html);
  return blocks.flatMap((b, index) => { const spec = parseButton(b); return spec ? [{ index, count: blocks.length, spec }] : []; });
}

export function moveBlock(html: string, index: number, dir: -1 | 1): string {
  const blocks = splitBlocks(html);
  const to = index + dir;
  if (index < 0 || index >= blocks.length || to < 0 || to >= blocks.length) return html;
  [blocks[index], blocks[to]] = [blocks[to]!, blocks[index]!];
  return join(blocks);
}

export function removeBlock(html: string, index: number): string {
  return join(splitBlocks(html).filter((_, i) => i !== index));
}

export function replaceBlock(html: string, index: number, block: string): string {
  return join(splitBlocks(html).map((b, i) => (i === index ? block : b)));
}

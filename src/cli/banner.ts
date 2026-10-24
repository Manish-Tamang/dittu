import pc from 'picocolors';
import { VERSION } from '../version.js';

// 5×7 dot-matrix glyphs ("#" = lit dot).
const GLYPHS: Record<string, string[]> = {
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};

const FROM = [34, 211, 238]; // cyan
const TO = [168, 85, 247]; // violet

const rgb = (t: number) => FROM.map((a, i) => Math.round(a + (TO[i] - a) * t));
const paint = (s: string, [r, g, b]: number[]) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;

/** "DITTU" drawn as a dotted matrix with a horizontal gradient. */
export function banner(color = pc.isColorSupported): string {
  const word = 'DITTU';
  const rows: string[] = [];
  const width = word.length * 6 - 1;
  for (let y = 0; y < 7; y++) {
    let line = '  ';
    for (let i = 0; i < word.length; i++) {
      const glyph = GLYPHS[word[i]][y];
      for (let x = 0; x < glyph.length; x++) {
        const col = i * 6 + x;
        const lit = glyph[x] === '#';
        const dot = lit ? '●' : '·';
        line += (color ? (lit ? paint(dot, rgb(col / (width - 1))) : pc.dim(dot)) : dot) + ' ';
      }
      if (i < word.length - 1) line += '  ';
    }
    rows.push(line.trimEnd());
  }
  const tagline = `clone any website · verified pixel by pixel  ${color ? pc.dim('v' + VERSION) : 'v' + VERSION}`;
  return `\n${rows.join('\n')}\n\n  ${color ? pc.bold(tagline) : tagline}\n`;
}

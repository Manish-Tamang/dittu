import pc from 'picocolors';

type Sink = (line: string) => void;

// stdout by default; the MCP server switches to stderr because stdout carries the protocol.
let sink: Sink = (line) => process.stdout.write(line + '\n');
let quiet = false;

export function setLogSink(next: Sink | 'stderr' | 'silent') {
  quiet = next === 'silent';
  sink = next === 'stderr' ? (line) => process.stderr.write(line + '\n') : typeof next === 'function' ? next : sink;
}

const emit = (line: string) => {
  if (!quiet) sink(line);
};

export const log = {
  step: (msg: string) => emit(`${pc.cyan('›')} ${msg}`),
  info: (msg: string) => emit(pc.dim(`  ${msg}`)),
  ok: (msg: string) => emit(`${pc.green('✓')} ${msg}`),
  warn: (msg: string) => emit(`${pc.yellow('!')} ${msg}`),
  error: (msg: string) => emit(`${pc.red('✗')} ${msg}`),
  raw: (msg: string) => emit(msg),
};

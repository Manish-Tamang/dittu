import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { setLogSink } from '../util/log.js';
import { VERSION } from '../version.js';
import { cloneInput, cloneTool, reportInput, reportTool, verifyInput, verifyTool } from './tools.js';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'dittu', version: VERSION }, { capabilities: { tools: {} } });

  server.registerTool(
    'clone_website',
    {
      title: 'Clone website frontend',
      description:
        "Clone a website's frontend (markup, original CSS, fonts, images, scroll animations) into a static preview plus " +
        'Next.js and Astro projects, then score it against the original with pixel diffs at desktop and mobile widths. ' +
        'Takes ~1 minute per page (several minutes with build=true). Returns output paths and scores (percent identical).',
      inputSchema: cloneInput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    cloneTool,
  );

  server.registerTool(
    'verify_clone',
    {
      title: 'Verify a clone',
      description:
        'Re-score an existing clone against the original site (e.g. after refactoring the generated components). ' +
        'Use targets ["next"] or ["astro"] to build and score a generated project. A score drop means the refactor changed rendering.',
      inputSchema: verifyInput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    verifyTool,
  );

  server.registerTool(
    'read_report',
    {
      title: 'Read clone report',
      description:
        'Manifest and latest scores of a clone: pages, targets, per-width scores, diff image paths, worst regions.',
      inputSchema: reportInput,
      annotations: { readOnlyHint: true },
    },
    reportTool,
  );

  return server;
}

/** stdio entry point (`dittu mcp`). stdout carries the protocol, so logs go to stderr. */
export function startStdioServer() {
  setLogSink('stderr');
  return serveStdio(createServer);
}

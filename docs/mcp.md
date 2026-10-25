# MCP server

`dittu mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io)
server over stdio. `dittu setup` registers it with your agents; to add it
by hand:

```json
{
  "mcpServers": {
    "dittu": { "command": "npx", "args": ["-y", "@manishtamang/dittu", "mcp"] }
  }
}
```

Logs go to stderr; stdout carries only the protocol.

Tool calls are long-running: `clone_website` takes about a minute per page,
several minutes with `build: true`. If your client has a tool timeout, raise it
(Claude Code: `MCP_TOOL_TIMEOUT=900000`).

## Tools

### `clone_website`

Clone a page (or crawl a site) and score the result.

| Input        | Type                    | Default              |                                                   |
| ------------ | ----------------------- | -------------------- | ------------------------------------------------- |
| `url`        | string                  | required             | scheme optional                                   |
| `outDir`     | string                  | `./dittu-out/<host>` |                                                   |
| `frameworks` | `("next" \| "astro")[]` | both                 | projects to generate                              |
| `styling`    | `"css" \| "tailwind"`   | `"css"`              | Tailwind utilities where lossless, rest stays CSS |
| `pages`      | int 1–50                | 1                    | same-site crawl (robots.txt respected)            |
| `verify`     | boolean                 | true                 | score preview vs original                         |
| `build`      | boolean                 | false                | also `npm install` + build + score generated apps |
| `remove`     | string[]                |                      | CSS selectors to drop                             |
| `waitMs`     | int                     | 1500                 | extra wait after load                             |

Returns (`structuredContent`):

```jsonc
{
  "outDir": "/abs/dittu-out/example.com",
  "outputs": { "preview": "…/preview", "next": "…/next", "astro": "…/astro" },
  "pages": [{ "route": "/", "url": "https://example.com/" }],
  "scores": [{ "target": "preview", "route": "/", "width": 1440, "score": 99.89, "worstBandsY": [], "diffImage": "…" }],
  "lowest": 99.89,
  "passed": true, // lowest ≥ 95
  "errors": [],
  "warnings": { "/": [] },
  "failedAssets": 0,
}
```

### `verify_clone`

Re-score an existing clone, typically after refactoring generated components.

| Input     | Type                                 | Default       |
| --------- | ------------------------------------ | ------------- |
| `outDir`  | string                               | required      |
| `targets` | `("preview" \| "next" \| "astro")[]` | `["preview"]` |
| `widths`  | int[]                                | `[1440, 390]` |

Returns `{ outDir, scores, lowest, passed, errors }`. A drop after a refactor
means rendering changed.

### `read_report`

`{ outDir }` → manifest plus the latest scores (no browser work).

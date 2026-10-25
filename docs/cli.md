# CLI

```bash
dittu <command> [options]
```

## Interactive mode

In a terminal, `dittu`, `dittu <url>` and `dittu clone [url]` show the
banner and ask for what you didn't pass as flags:

```
  ● ● ● ● ·   ● ● ● ● ●   ● ● ● ● ●   ● ● ● ● ●   ● · · · ●
  ● · · · ●   · · ● · ·   · · ● · ·   · · ● · ·   ● · · · ●
  …
◆  Export to which frameworks?
│  ◼ Next.js (App Router, React components (JSX))
│  ◼ Astro (.astro components, zero JS by default)
◆  How should styles be written?  original CSS / Tailwind CSS
◆  How much of the site?          just this page / 5 / 10 / custom
◆  Check the clone against the original?   quick / build the apps too / skip
◆  Where should I save it?
◆  Change advanced settings?      mobile render, breakpoint, elements to leave out, wait
◇  Ready to clone ── summary ──   ◆ Start?
```

Flags you pass are never asked again (`dittu clone <url> -f astro` skips the
framework question). `-y`/`--yes`, a non-interactive shell, or `CI=true`
skip all questions and use flags + defaults. Ctrl+C cancels before anything is written.

Re-cloning into an existing folder replaces the previous results
(generated projects keep `node_modules`).

## `clone [url]`

Capture, transform, export, then verify. `dittu <url>` is the same command.

| Option                           | Default            |                                                      |
| -------------------------------- | ------------------ | ---------------------------------------------------- |
| `-o, --out <dir>`                | `dittu-out/<host>` | output directory                                     |
| `-f, --framework <list>`         | `next,astro`       | `next`, `astro`, or `none`                           |
| `-s, --styling <mode>`           | `css`              | `css` or `tailwind` ([Tailwind output](tailwind.md)) |
| `-p, --pages <n>`                | `1`                | crawl up to n same-site pages (robots.txt respected) |
| `--viewport <WxH>`               | `1440x900`         | capture viewport                                     |
| `--mobile <WxH>` / `--no-mobile` | `390x844`          | second render for JS-computed mobile layout          |
| `--breakpoint <px>`              | `768`              | width below which mobile layout applies              |
| `--widths <list>`                | `1440,390`         | widths to verify                                     |
| `--build`                        | off                | install + build + score the generated apps           |
| `--remove <selectors…>`          |                    | drop elements (cookie banners, chat widgets)         |
| `--wait <ms>`                    | `1500`             | extra wait after load                                |
| `--no-split`                     |                    | one component per page                               |
| `--no-format`                    |                    | skip prettier                                        |
| `--no-verify`                    |                    | skip scoring                                         |
| `-y, --yes`                      |                    | no questions: flags and defaults only                |

## `verify <dir>`

Re-score a clone. `--build` adds the generated apps; `--targets next,astro`
picks explicitly; `--widths` as above.

## `serve <dir>`

Serve the static preview (`--port`, default 4321).

## `setup`

Register the MCP server and skills with detected agents (Claude Code, Cursor,
Gemini CLI, Codex). `--agents claude-code,cursor` to pick, `--dry-run` to preview.
Re-running replaces dittu's entries and leaves other servers untouched.

## `mcp`

Run the MCP server over stdio. See [mcp.md](mcp.md).

## `doctor`

Check Node.js, Chromium (installed and launchable, with the missing system
libraries named) and npm. Exits 1 if anything is missing, printing a fix for each.

## Output directory

```
dittu-out/<host>/
  preview/      static HTML (reference export)
  next/         Next.js App Router project
  astro/        Astro project
  assets/       images, fonts, per-page CSS, dittu-motion.js
  reference/    screenshots of the original
  report/       clone screenshots, *.diff.png, report.json, build logs
  dittu.json    manifest, warnings, failed assets
```

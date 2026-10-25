# dittu website

The landing page and docs for [dittu](https://github.com/Manish-Tamang/dittu), built with Astro and Tailwind CSS.

```bash
pnpm install
pnpm dev     # http://localhost:4321
pnpm build   # static site in dist/
```

## Docs sync

The pages under `/docs` are rendered from the markdown in the repo's
[`docs/`](https://github.com/Manish-Tamang/dittu/tree/main/docs) folder on GitHub
(`main` branch), through the loader in `src/lib/github-docs.ts`:

- Every build fetches the latest docs. New files show up in the sidebar automatically
  (order is set in `src/content.config.ts`; unlisted docs go last).
- While `pnpm dev` runs, docs re-sync every minute.
- Unchanged docs aren't downloaded again: the listing uses an ETag and files are
  compared by SHA.
- If GitHub can't be reached and nothing is cached, the local `../docs` folder is used.

Links between docs (`cli.md`) become `/docs/cli`; other relative links point to GitHub.

Anonymous GitHub API calls are limited to 60 an hour. Pass a token to raise that:

```bash
GITHUB_TOKEN=$(gh auth token) pnpm dev
```

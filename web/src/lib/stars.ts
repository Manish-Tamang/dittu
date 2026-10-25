import { REPO_API } from '../data';

const TTL = 10 * 60_000;
let cached: { at: number; stars: Promise<number | undefined> } | undefined;

/** GitHub star count, cached so dev page loads don't burn through the API limit. */
export function getStars() {
  if (!cached || Date.now() - cached.at > TTL) {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const stars = fetch(REPO_API, { headers })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((repo) => repo?.stargazers_count as number | undefined)
      .catch(() => undefined);
    cached = { at: Date.now(), stars };
  }
  return cached.stars;
}

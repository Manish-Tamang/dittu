import { REPO, REPO_API } from '../data';

/** Shown when GitHub can't be reached (keep in step with the latest release). */
const FALLBACK = { version: '0.3.0', url: `${REPO}/releases/tag/v0.3.0` };

const TTL = 10 * 60_000;
let cached: { at: number; release: Promise<typeof FALLBACK> } | undefined;

/** Latest GitHub release, cached like the star count so dev page loads stay cheap. */
export function getRelease() {
  if (!cached || Date.now() - cached.at > TTL) {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const release = fetch(`${REPO_API}/releases/latest`, { headers })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((r) => (r?.tag_name ? { version: String(r.tag_name).replace(/^v/, ''), url: r.html_url } : FALLBACK))
      .catch(() => FALLBACK);
    cached = { at: Date.now(), release };
  }
  return cached.release;
}

import { AUTHOR, NPM, REPO, SITE } from '../data';

/** schema.org Person for the author, shared by every page. */
export const person = {
  '@type': 'Person',
  name: AUTHOR.name,
  url: AUTHOR.site,
  sameAs: AUTHOR.sameAs,
};

export function websiteSchema(site: URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: site.href,
    description: SITE.description,
    author: person,
  };
}

export function softwareSchema(site: URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: SITE.description,
    url: site.href,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    softwareRequirements: 'Node.js 20.11+',
    license: 'https://opensource.org/licenses/MIT',
    downloadUrl: NPM,
    sameAs: [REPO, NPM],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: person,
  };
}

export function faqSchema(faq: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; url: URL }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.href,
    })),
  };
}

export function articleSchema(opts: { title: string; description: string; url: URL; section: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: opts.title,
    description: opts.description,
    url: opts.url.href,
    articleSection: opts.section,
    inLanguage: 'en',
    author: person,
    publisher: person,
    isPartOf: { '@type': 'WebSite', name: `${SITE.name} docs` },
  };
}

import type { Metadata } from 'next';

export const publicSiteUrl = 'https://usemakocrm.com';

// Only public marketing pages opt in. Account and token routes inherit noindex.
export function publicMetadata(title: string, description: string, path: string): Metadata {
  const url = new URL(path, publicSiteUrl).toString();
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website', siteName: 'Mako CRM', locale: 'en_US',
      title, description, url,
      images: [{ url: `${publicSiteUrl}/mako-email-logo.png`, alt: 'Mako CRM' }],
    },
    twitter: { card: 'summary', title, description, images: [`${publicSiteUrl}/mako-email-logo.png`] },
  };
}

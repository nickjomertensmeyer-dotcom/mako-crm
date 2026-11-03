import type { MetadataRoute } from 'next';
import { publicSiteUrl } from '@/lib/public-metadata';

export default function robots(): MetadataRoute.Robots {
  // Let crawlers read noindex on non-marketing pages. Authentication protects records.
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: `${publicSiteUrl}/sitemap.xml` };
}

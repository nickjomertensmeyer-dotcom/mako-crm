import type { MetadataRoute } from 'next';
import { publicSiteUrl } from '@/lib/public-metadata';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/reviews', '/privacy', '/terms'].map(path => ({ url: new URL(path, publicSiteUrl).toString() }));
}

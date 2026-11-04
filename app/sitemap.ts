import type { MetadataRoute } from 'next';
import { publicSiteUrl } from '@/lib/public-metadata';
import {industryPages,industryPath} from '@/lib/industry-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/about', '/for', ...industryPages.map(page=>industryPath(page.slug)), '/reviews', '/privacy', '/cookies', '/terms'].map(path => ({ url: new URL(path, publicSiteUrl).toString(), ...(['/','/for/lawn-care','/privacy'].includes(path)?{lastModified:new Date('2026-11-03T00:00:00Z')}: {}) }));
}

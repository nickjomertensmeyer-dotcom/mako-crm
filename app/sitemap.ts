import type { MetadataRoute } from 'next';
import { publicSiteUrl } from '@/lib/public-metadata';
import {industryPages,industryPath} from '@/lib/industry-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/for', ...industryPages.map(page=>industryPath(page.slug)), '/reviews', '/privacy', '/terms'].map(path => ({ url: new URL(path, publicSiteUrl).toString() }));
}

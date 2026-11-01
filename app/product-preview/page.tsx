import Preview from '../preview/page';

// Use only fictional demo data here; authenticated workspace pages remain unframeable.
export default async function ProductPreview(props: Parameters<typeof Preview>[0]) {
 return <><base target="_top"/>{await Preview(props)}</>;
}

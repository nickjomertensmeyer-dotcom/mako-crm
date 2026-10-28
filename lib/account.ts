export type AccountSettings = {
  name: string; email: string; avatar: string;
  appearance: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact'; reducedMotion: boolean;
};
export function accountSettings(metadata: Record<string, unknown> = {}, email = ''): AccountSettings {
  return {
    name: typeof metadata.display_name === 'string' ? metadata.display_name.slice(0,80) : '', email,
    avatar: typeof metadata.mako_avatar === 'string' ? metadata.mako_avatar : '',
    appearance: metadata.mako_appearance === 'dark' || metadata.mako_appearance === 'system' ? metadata.mako_appearance : 'light',
    density: metadata.mako_density === 'compact' ? 'compact' : 'comfortable',
    reducedMotion: metadata.mako_reduce_motion === true,
  };
}
export function validatePreferences(form: FormData) {
  const appearance = form.get('appearance'), density = form.get('density');
  if (!['light','dark','system'].includes(String(appearance)) || !['comfortable','compact'].includes(String(density))) throw new Error('Choose a valid appearance and spacing.');
  return {mako_appearance: appearance, mako_density: density, mako_reduce_motion: form.get('reducedMotion') === 'on'};
}

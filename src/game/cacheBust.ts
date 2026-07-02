export const ASSET_CACHE_VERSION =
  typeof __ASSET_CACHE_VERSION__ === 'string' && __ASSET_CACHE_VERSION__.trim()
    ? __ASSET_CACHE_VERSION__
    : 'dev';

export function withAssetCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(ASSET_CACHE_VERSION)}`;
}

/**
 * Resolves the optional external Node.js API base URL (e.g. Render backend at https://api.hisabveda.com)
 * when the frontend is served from static Firebase Hosting (https://hisabveda.com).
 * Falls back to '' (same-origin /api/*) for single-server Node/Cloud Run/local dev builds.
 */
export function getBackendApiBaseUrl(): string {
  try {
    const raw = String((import.meta as any)?.env?.VITE_API_BASE_URL || '').trim();
    return raw.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function resolveApiUrl(apiPath: string): string {
  const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const base = getBackendApiBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}

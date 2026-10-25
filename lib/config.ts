// Public, browser-safe configuration only (BUILD_SPEC §8.2). Next.js inlines NEXT_PUBLIC_* values at
// build time, so each must be referenced literally — no dynamic process.env[key] lookups.
const azureClientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || '';

/**
 * A required address. The localhost default is for development only: a production build without
 * the variable (e.g. not set in the Vercel project before building) fails instead of shipping an
 * app that calls the officer's own computer.
 */
function required(value: string | undefined, name: string, devDefault: string): string {
  if (value) return value.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is not set. Set it for the build (e.g. in the Vercel project's environment variables).`);
  }
  return devDefault;
}

export const config = {
  apiBaseUrl: required(process.env.NEXT_PUBLIC_API_BASE_URL, 'NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4848/api'),
  socketUrl: required(process.env.NEXT_PUBLIC_SOCKET_URL, 'NEXT_PUBLIC_SOCKET_URL', 'http://localhost:4848'),
  azureClientId,
  azureTenantId: process.env.NEXT_PUBLIC_AZURE_TENANT_ID || '',
  /** Delegated scope for this API (Entra → Expose an API). */
  azureApiScope: process.env.NEXT_PUBLIC_AZURE_API_SCOPE || `api://${azureClientId}/access_as_user`,
} as const;

export const microsoftSignInConfigured = Boolean(config.azureClientId && config.azureTenantId);

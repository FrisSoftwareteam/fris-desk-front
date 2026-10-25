import { PublicClientApplication, type Configuration } from '@azure/msal-browser';
import { config, microsoftSignInConfigured } from './config';

export const loginRequest = { scopes: [config.azureApiScope] };

/** One MSAL instance per browser tab, or null when the Entra IDs aren't configured. */
export function createMsalInstance(): PublicClientApplication | null {
  if (!microsoftSignInConfigured || typeof window === 'undefined') return null;
  const msalConfig: Configuration = {
    auth: {
      clientId: config.azureClientId,
      authority: `https://login.microsoftonline.com/${config.azureTenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    // Session storage: the MSAL cache disappears when the tab closes. The app session itself lives
    // in an httpOnly cookie set by the API, so MSAL is only needed during sign-in.
    cache: { cacheLocation: 'sessionStorage' },
  };
  return new PublicClientApplication(msalConfig);
}

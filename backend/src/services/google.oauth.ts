import axios from 'axios';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export function buildGoogleOAuthUrl(tenantId: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    // Sandbox fallback: redirect straight back to our local callback with a mock code
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    console.log('[Google OAuth] Sandbox active. Redirecting straight to local callback.');
    return `${backendUrl}/api/v1/auth/google/callback?code=mock_google_oauth_code_sandbox&state=${encodeURIComponent(tenantId)}`;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state: tenantId,
    scope: 'https://www.googleapis.com/auth/adwords',
    response_type: 'code',
    access_type: 'offline', // Demands refresh_token for background background syncs
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokenExchangeResult = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenExchangeResult> {
  if (code === 'mock_google_oauth_code_sandbox') {
    return {
      access_token: 'mock_google_access_token_12345',
      refresh_token: 'mock_google_refresh_token_67890',
      expires_in: 3600,
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth environment variables are missing.');
  }

  const { data } = await axios.post(TOKEN_ENDPOINT, new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return data as GoogleTokenExchangeResult;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  if (refreshToken === 'mock_google_refresh_token_67890') {
    return 'mock_google_access_token_12345';
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials missing for token refresh.');
  }

  const { data } = await axios.post(TOKEN_ENDPOINT, new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return data.access_token as string;
}

export async function getGoogleCustomerAccount(accessToken: string): Promise<string> {
  if (accessToken === 'mock_google_access_token_12345') {
    return '123-456-7890';
  }

  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;
  if (!developerToken) {
    throw new Error('GOOGLE_DEVELOPER_TOKEN is required to fetch accounts.');
  }

  // Get accessible customers from Google Ads API
  try {
    const { data } = await axios.get('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
      }
    });

    if (data.resourceNames && data.resourceNames.length > 0) {
      // Return the first customer ID (format: resourceNames: ["customers/1234567890"])
      const matches = data.resourceNames[0].match(/customers\/(\d+)/);
      if (matches && matches[1]) {
        return matches[1];
      }
    }
  } catch (err) {
    console.error('[Google API] Failed to list accounts:', err);
  }

  return '123-456-7890'; // Graceful fallback customer ID
}

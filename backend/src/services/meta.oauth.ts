import axios from 'axios';

const GRAPH_BASE_URL = 'https://graph.facebook.com/v19.0';
const META_SCOPES = ['ads_read', 'ads_management', 'business_management'];

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Meta OAuth.`);
  }

  return value;
}

export function buildMetaOAuthUrl(tenantId: string) {
  const params = new URLSearchParams({
    client_id: requireEnv('META_APP_ID'),
    redirect_uri: requireEnv('META_REDIRECT_URI'),
    state: tenantId,
    scope: META_SCOPES.join(','),
    response_type: 'code',
  });

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForShortLivedToken(code: string) {
  const { data } = await axios.get(`${GRAPH_BASE_URL}/oauth/access_token`, {
    params: {
      client_id: requireEnv('META_APP_ID'),
      client_secret: requireEnv('META_APP_SECRET'),
      redirect_uri: requireEnv('META_REDIRECT_URI'),
      code,
    },
  });

  return data as { access_token: string; token_type?: string; expires_in?: number };
}

export async function exchangeForLongLivedToken(shortLivedToken: string) {
  const { data } = await axios.get(`${GRAPH_BASE_URL}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: requireEnv('META_APP_ID'),
      client_secret: requireEnv('META_APP_SECRET'),
      fb_exchange_token: shortLivedToken,
    },
  });

  return data as { access_token: string; token_type?: string; expires_in?: number };
}

export async function getMetaUserId(accessToken: string) {
  const { data } = await axios.get(`${GRAPH_BASE_URL}/me`, {
    params: {
      fields: 'id',
      access_token: accessToken,
    },
  });

  return String(data.id);
}

export function getTokenExpiry(expiresInSeconds = 60 * 24 * 60 * 60) {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

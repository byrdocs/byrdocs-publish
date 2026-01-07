import { Octokit } from '@octokit/rest';
import { getRequestContext } from '@cloudflare/next-on-pages';

async function generateJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds ago to prevent clock skew
    exp: now + 600, // Expires in 10 minutes (max allowed)
    iss: appId
  };

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const message = `${encodedHeader}.${encodedPayload}`;

  // Import private key for signing
  // Remove PEM headers/footers and whitespace
  let keyData = privateKey
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s/g, '');

  // Convert base64 to binary
  const binaryKey = new Uint8Array(
    atob(keyData)
      .split('')
      .map(char => char.charCodeAt(0))
  );

  // Import the key - GitHub Apps use PKCS#8 format
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the message
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(message)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${message}.${encodedSignature}`;
}

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const env = getRequestContext().env;
  const jwt = await generateJWT(env.APP_ID, env.GITHUB_APP_PRIVATE_KEY);

  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'YAML-Generator-App/1.0'
    }
  });

  if (!response.ok) {
    console.error(await response.json())
    throw new Error(`Failed to get installation access token: ${response.statusText}`);
  }

  const data = await response.json() as { token: string };
  return data.token;
}

async function createInstallationOctokit(installationId: number, token?: string): Promise<Octokit> {
  if (!token) {
    token = await getInstallationAccessToken(installationId);
  }
  return new Octokit({
    auth: token,
    userAgent: 'BYR Docs Publish/0.1.0'
  });
}

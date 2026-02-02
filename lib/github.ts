import { Octokit } from '@octokit/rest';
import { getPrismaClient } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';

type RepoInfo={ name: string; full_name: string; private: boolean };
export async function generateJWT(appId: string, privateKey: string): Promise<string> {
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

/*
async function createInstallationOctokit(installationId: number, token?: string): Promise<Octokit> {
  if (!token) {
    token = await getInstallationAccessToken(installationId);
  }
  return new Octokit({
    auth: token,
    userAgent: 'BYR Docs Publish/0.1.0'
  });
}
*/

// Helper function to check if a repository is a byrdocs-archive fork by fetching parent info from GitHub API
async function isByrdocsArchiveFork(repoFullName: string, githubToken?: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(githubToken && { 'Authorization': `Bearer ${githubToken}` })
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch repo details for ${repoFullName}: ${response.status}`);
      return false;
    }

    const repoData: any = await response.json();
    
    const isTargetFork = repoData.fork && repoData.parent?.full_name === `${process.env.NEXT_PUBLIC_ARCHIVE_REPO_OWNER}/${process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME}`;
    
    if (isTargetFork) {
      console.log(`✓ Confirmed: ${repoFullName} is a fork of ${process.env.NEXT_PUBLIC_ARCHIVE_REPO_OWNER}/${process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME}`);
    }
    
    return isTargetFork;
  } catch (error) {
    console.error(`Error checking if ${repoFullName} is ${process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME} fork:`, error);
    return false;
  }
}

// Helper function to find byrdocs-archive fork from repository list using heuristics
export async function findByrdocsArchiveFork(repositories?: Array<RepoInfo>, githubToken?: string): Promise<string | null> {
  if (!repositories || repositories.length === 0) {
    return null;
  }

  // Filter public repositories only (forks are always public)
  const publicRepos = repositories.filter(repo => !repo.private);
  
  if (publicRepos.length === 0) {
    return null;
  }

  console.log(`Checking ${publicRepos.length} public repositories for ${process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME} fork`);
  
  // Heuristic 1: Check repositories named 'byrdocs-archive' first
  const namedRepos = publicRepos.filter(repo => repo.name === process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME);
  const otherRepos = publicRepos.filter(repo => repo.name !== process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME);
  
  // First, check only repositories named 'byrdocs-archive'
  if (namedRepos.length > 0) {
    console.log(`Checking ${namedRepos.length} repositories named ${process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME} first`);
    const namedRepoPromises = namedRepos.map(async (repo) => {
      console.log(`Checking named repo: ${repo.full_name}`);
      const isFork = await isByrdocsArchiveFork(repo.full_name, githubToken);
      return isFork ? repo.name : null;
    });

    const namedResults = await Promise.all(namedRepoPromises);
    const foundNamed = namedResults.find(result => result !== null);
    
    if (foundNamed) {
      return foundNamed;
    }
  }
  
  // If no named repos found, check other repositories
  if (otherRepos.length > 0) {
    console.log(`No ${process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME} fork found in named repos, checking ${otherRepos.length} other repositories`);
    const otherRepoPromises = otherRepos.map(async (repo) => {
      console.log(`Checking other repo: ${repo.full_name}`);
      const isFork = await isByrdocsArchiveFork(repo.full_name, githubToken);
      return isFork ? repo.name : null;
    });

    const otherResults = await Promise.all(otherRepoPromises);
    return otherResults.find(result => result !== null) || null;
  }
  
  return null;
}

// Helper function to handle installation upsert
export async function upsertInstallation(
  installationId: string,
  accountLogin: string,
  accountType: string,
  repositoryName: string | null,
  isSuspended: boolean = false
) {
  const prisma = getPrismaClient();
  
  return await prisma.gitHubInstallation.upsert({
    where: {
      installationId,
    },
    update: {
      accountLogin,
      accountType,
      repositoryName,
      isSuspended,
      updatedAt: new Date(),
    },
    create: {
      installationId,
      accountLogin,
      accountType,
      repositoryName,
      isSuspended,
    },
  });
}

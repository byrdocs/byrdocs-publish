import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db';
import { RepoInfo, generateJWT, findByrdocsArchiveFork, upsertInstallation, getInstallationAccessToken } from '@/lib/github';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
const itemsPerPage=30;

async function getAppInstallations(jwt:string) {
  return fetchAllPages(
    `https://api.github.com/app/installations?per_page=${itemsPerPage}`,
    {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'BYR-Docs-Publish/1.0'
      }
    },
    (data) => data
  );
}

async function getRepoForInstallation(installationId:string, jwt:string):Promise<string> {
  const accessTokenResponse = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method:'POST',
      headers:{
        'Authorization':`Bearer ${jwt}`,
        'Accept':'application/vnd.github.v3+json',
        'User-Agent':'BYR-Docs-Publish/1.0'
      },
    }
  );
  if (!accessTokenResponse.ok) {
    throw new Error(`Failed to fetch installation access token: ${accessTokenResponse.statusText}`);
  }
  const {token} = await accessTokenResponse.json();
  const repositories = await fetchAllPages(
    `https://api.github.com/installation/repositories?per_page=${itemsPerPage}`,
    {
      headers:{
        'Authorization':`Bearer ${token}`,
        'Accept':'application/vnd.github.v3+json',
        'User-Agent':'BYR-Docs-Publish/1.0'
      },
    },
    (data) => data.repositories ?? []
  );
  const reposInfo = repositories.map((repo:any)=>({
    name:repo.name,
    full_name:repo.full_name,
    private:repo.private,
  } satisfies RepoInfo));
  return findByrdocsArchiveFork(reposInfo, token);
}

async function syncInstallations() {
  const env = getRequestContext().env;
  const prisma = getPrismaClient();
  const jwt=await generateJWT(env.APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  
  try {
    const installations = await getAppInstallations(jwt);
    
    const checkedInstallations:Array<{
      installationId:string,
      accountLogin:string,
      accountType:string,
      repoFullName:string|null,
    }>=[];
    for (const installation of installations) {
      const repositories = await getRepoForInstallation(installation.id.toString(), jwt);
      upsertInstallation(
        installation.id.toString(),
        installation.account.login,
        installation.account.type,
        repositories || null,
        installation.suspended_at!==null,
      );
      checkedInstallations.push({
        installationId: installation.id.toString(),
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        repoFullName: repositories,
      });
    }

    return { synced: checkedInstallations };
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const env = getRequestContext().env;
  const authHeader = request.headers.get('authorization');
  
  if (!env.SYNC_INSTALLATION_SECRET || authHeader !== `Bearer ${env.SYNC_INSTALLATION_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncInstallations();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request:NextRequest){
  return Response(`Usage:
POST /api/sync-installations
Authorization: Bearer \${SYNC_INSTALLATION_SECRET}
`);
}

function parseNextLink(linkHeader:string | null):string | null {
  if (!linkHeader) {
    return null;
  }
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const [urlPart, relPart] = part.split(';').map((value) => value.trim());
    if (relPart === 'rel="next"' && urlPart?.startsWith('<') && urlPart.endsWith('>')) {
      return urlPart.slice(1, -1);
    }
  }
  return null;
}

async function fetchAllPages<T>(
  url:string,
  init:RequestInit,
  getItems:(data:any) => T[]
):Promise<T[]> {
  const items:T[] = [];
  let nextUrl:string | null = url;
  let pageCount = 0;
  while (nextUrl) {
    pageCount += 1;
    if (pageCount > itemsPerPage) {
      throw new Error(`Pagination exceeded ${itemsPerPage} pages`);
    }
    const response = await fetch(nextUrl, init);
    if (!response.ok) {
      throw new Error(`Failed to fetch paged data: ${response.statusText}`);
    }
    const data = await response.json();
    items.push(...getItems(data));
    nextUrl = parseNextLink(response.headers.get('link'));
  }
  return items;
}

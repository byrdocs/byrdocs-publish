import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db';
import { RepoInfo, generateJWT, findByrdocsArchiveFork, upsertInstallation, getInstallationAccessToken } from '@/lib/github';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

async function getAppInstallations(jwt:string) {
  const response = await fetch('https://api.github.com/app/installations', {
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BYR-Docs-Publish/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch installations: ${response.statusText}`);
  }

  return response.json();
}

async function getReposForInstallation(installationId:string, jwt:string):Promise<RepoInfo[]> {
  const accessTokenResponse=await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`,{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${jwt}`,
      'Accept':'application/vnd.github.v3+json',
      'User-Agent':'BYR-Docs-Publish/1.0'
    },
  });
  const {token}=await accessTokenResponse.json();
  const reposResponse=await fetch('https://api.github.com/installation/repositories',{
    headers:{
      'Authorization':`Bearer ${token}`,
      'Accept':'application/vnd.github.v3+json',
      'User-Agent':'BYR-Docs-Publish/1.0'
    },
  });
  const reposData=await reposResponse.json();
  return reposData.repositories.map((repo:any)=>({
    name:repo.name,
    full_name:repo.full_name,
    private:repo.private,
  }satisfies RepoInfo));
}

async function syncInstallations() {
  const env = getRequestContext().env;
  const prisma = getPrismaClient();
  const jwt=await generateJWT(env.APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  
  try {
    const installations = await getAppInstallations(jwt);
    
    for (const installation of installations) {
      const repositories = await getReposForInstallation(installation.id.toString(), jwt);
      const forkNames=await findByrdocsArchiveFork(repositories, token);
      upsertInstallation(
        installation.id.toString(),
        installation.account.login,
        installation.account.type,
        forkName || null,
        installation.suspended_at!==null,
      );
    }

    return { synced: installations.length };
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const env = getRequestContext().env;
  const authHeader = request.headers.get('authorization');
  
  if (env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
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

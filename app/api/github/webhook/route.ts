import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getPrismaClient } from '@/lib/db';
import { Webhooks } from '@octokit/webhooks';
import { getInstallationAccessToken } from '@/lib/github';

export const runtime = 'edge';

interface GitHubWebhookPayload {
  action: string;
  installation?: {
    id: number;
    account: {
      login: string;
      type: string;
    };
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_added?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
}

// Helper function to verify webhook signature
async function verifyWebhookSignature(request: NextRequest, webhookSecret: string): Promise<{ verified: boolean; body?: string; error?: string }> {
  const signature = request.headers.get('x-hub-signature-256');
  
  if (!signature) {
    return { verified: false, error: 'No signature provided' };
  }

  const body = await request.text();
  const webhooks = new Webhooks({ secret: webhookSecret });
  
  try {
    const verified = await webhooks.verify(body, signature);
    return { verified, body };
  } catch (error) {
    return { verified: false, error: 'Invalid signature' };
  }
}

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
    
    const isTargetFork = repoData.fork && repoData.parent?.full_name === 'byrdocs/byrdocs-archive';
    
    if (isTargetFork) {
      console.log(`✓ Confirmed: ${repoFullName} is a fork of byrdocs/byrdocs-archive`);
    }
    
    return isTargetFork;
  } catch (error) {
    console.error(`Error checking if ${repoFullName} is byrdocs-archive fork:`, error);
    return false;
  }
}

// Helper function to find byrdocs-archive fork from repository list using heuristics
async function findByrdocsArchiveFork(repositories?: Array<{ name: string; full_name: string; private: boolean }>, githubToken?: string): Promise<string | null> {
  if (!repositories || repositories.length === 0) {
    return null;
  }

  // Filter public repositories only (forks are always public)
  const publicRepos = repositories.filter(repo => !repo.private);
  
  if (publicRepos.length === 0) {
    return null;
  }

  console.log(`Checking ${publicRepos.length} public repositories for byrdocs-archive fork`);
  
  // Heuristic 1: Check repositories named 'byrdocs-archive' first
  const namedRepos = publicRepos.filter(repo => repo.name === 'byrdocs-archive');
  const otherRepos = publicRepos.filter(repo => repo.name !== 'byrdocs-archive');
  
  // First, check only repositories named 'byrdocs-archive'
  if (namedRepos.length > 0) {
    console.log(`Checking ${namedRepos.length} repositories named 'byrdocs-archive' first`);
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
    console.log(`No byrdocs-archive fork found in named repos, checking ${otherRepos.length} other repositories`);
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
async function upsertInstallation(
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

// Main webhook handler
export async function POST(request: NextRequest) {
  console.log('GitHub webhook received');
  
  try {
    // Get webhook secret from environment
    const env = getRequestContext().env;
    const webhookSecret = env.WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Verify webhook signature
    const { verified, body, error } = await verifyWebhookSignature(request, webhookSecret);
    
    if (!verified || !body) {
      return NextResponse.json(
        { error: error || 'Webhook verification failed' },
        { status: 401 }
      );
    }

    // Parse the verified payload
    const payload: GitHubWebhookPayload = JSON.parse(body);
    console.log('GitHub webhook action:', payload.action);

    const prisma = getPrismaClient();

    // Handle different webhook events
    switch (payload.action) {
      case 'created': {
        if (!payload.installation) break;

        const { installation, repositories } = payload;
        console.log('Installation created, processing repositories:', repositories?.length || 0);

        // Get installation access token to avoid rate limiting
        let githubToken: string | undefined;
        try {
          githubToken = await getInstallationAccessToken(installation.id);
        } catch (error) {
          console.warn('Failed to get installation token, proceeding without authentication:', error);
        }

        // Find byrdocs-archive fork
        const repositoryName = await findByrdocsArchiveFork(repositories, githubToken);

        await upsertInstallation(
          installation.id.toString(),
          installation.account.login,
          installation.account.type,
          repositoryName,
          false // not suspended on creation
        );

        console.log(
          repositoryName
            ? `Installation ${installation.id} created for ${installation.account.login} with byrdocs-archive fork: ${repositoryName}`
            : `Installation ${installation.id} created for ${installation.account.login} (no byrdocs-archive fork found)`
        );
        break;
      }
      
      case 'added': {
        if (!payload.installation || !payload.repositories_added) break;

        const { installation, repositories_added } = payload;

        // Heuristic 2: If database already has a repo, don't process added event
        const currentInstallation = await prisma.gitHubInstallation.findUnique({
          where: {
            installationId: installation.id.toString(),
          },
        });

        if (currentInstallation?.repositoryName) {
          console.log(`Installation ${installation.id} already has repository ${currentInstallation.repositoryName}, skipping added event`);
          break;
        }

        console.log('Repositories added to installation:', repositories_added.length);

        // Get installation access token to avoid rate limiting
        let githubToken: string | undefined;
        try {
          githubToken = await getInstallationAccessToken(installation.id);
        } catch (error) {
          console.warn('Failed to get installation token, proceeding without authentication:', error);
        }

        // Check if any of the added repositories is a byrdocs-archive fork
        const repositoryName = await findByrdocsArchiveFork(repositories_added, githubToken);

        if (repositoryName) {
          await upsertInstallation(
            installation.id.toString(),
            installation.account.login,
            installation.account.type,
            repositoryName,
            currentInstallation?.isSuspended || false
          );

          console.log(`byrdocs-archive fork ${repositoryName} added to installation ${installation.id}`);
        }
        break;
      }
      
      case 'removed': {
        if (!payload.installation || !payload.repositories_removed) break;
        
        const { installation, repositories_removed } = payload;
        
        // Heuristic 3: If database has no repo, don't process removed event
        const currentInstallation = await prisma.gitHubInstallation.findUnique({
          where: {
            installationId: installation.id.toString(),
          },
        });
        
        if (!currentInstallation?.repositoryName) {
          console.log(`Installation ${installation.id} has no repository, skipping removed event`);
          break;
        }
        
        console.log('Repositories removed from installation:', repositories_removed.length);
        
        // Check if the current bound repository was removed
        const removedRepo = repositories_removed.find(repo => 
          repo.name === currentInstallation.repositoryName
        );
        
        if (removedRepo) {
          // First delete related bindings manually
          await prisma.repositoryBinding.deleteMany({
            where: {
              installation: {
                installationId: installation.id.toString(),
              },
            },
          });

          // Then clear the repository name from the installation
          await prisma.gitHubInstallation.update({
            where: {
              installationId: installation.id.toString(),
            },
            data: {
              repositoryName: null,
              updatedAt: new Date(),
            },
          });
          
          console.log(`Repository ${removedRepo.name} removed from installation ${installation.id}, cleared from database and deleted related bindings`);
        }
        break;
      }
      
      case 'suspend': {
        if (!payload.installation) break;
        
        // Mark installation as suspended
        await prisma.gitHubInstallation.update({
          where: {
            installationId: payload.installation.id.toString(),
          },
          data: {
            isSuspended: true,
            updatedAt: new Date(),
          },
        }).catch(() => {
          // Installation might not exist, ignore error
        });
        
        console.log(`Installation ${payload.installation.id} suspended`);
        break;
      }
      
      case 'unsuspend': {
        if (!payload.installation) break;
        
        // Mark installation as unsuspended
        await prisma.gitHubInstallation.update({
          where: {
            installationId: payload.installation.id.toString(),
          },
          data: {
            isSuspended: false,
            updatedAt: new Date(),
          },
        }).catch(() => {
          // Installation might not exist, ignore error
        });
        
        console.log(`Installation ${payload.installation.id} unsuspended`);
        break;
      }
      
      case 'deleted': {
        if (!payload.installation) break;
        
        await prisma.gitHubInstallation.delete({
          where: {
            installationId: payload.installation.id.toString(),
          },
        }).catch((error: any) => {
          // Installation might not exist, log but don't fail
          console.log(`Installation ${payload.installation!.id} not found for deletion:`, error);
        });

        console.log(`Installation ${payload.installation.id} deleted`);
        break;
      }
      
      default:
        console.log(`Unhandled webhook action: ${payload.action}`);
    }

    return NextResponse.json({ 
      message: 'Webhook processed successfully',
      action: payload.action 
    });
    
  } catch (error) {
    console.error('GitHub webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    message: 'GitHub webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
}
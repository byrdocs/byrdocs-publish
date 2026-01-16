'use server';

import { getPrismaClient } from '@/lib/db';
import { getUserInfo } from '@/lib/auth';
import { Octokit } from '@octokit/rest';

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  fork: boolean;
  updated_at: string;
  installationId: string;
}

export interface UserBinding {
  id: number;
  repository: Repository;
  createdAt: string;
}

// Get current user's repository binding
export async function getCurrentBinding(): Promise<UserBinding | null> {
  const user = await getUserInfo();
  if (!user) {
    return null;
  }
  const prisma = getPrismaClient();

  const binding = await prisma.repositoryBinding.findFirst({
    where: {
      user: {
        githubUserId: user.github_id,
      },
    },
    include: {
      installation: true,
      user: true,
    },
  });

  if (!binding) {
    return null;
  }

  return {
    id: binding.id,
    repository: {
      id: parseInt(binding.installation.installationId),
      name: binding.installation.repositoryName || process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME,
      full_name: `${binding.installation.accountLogin}/${binding.installation.repositoryName || process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME}`,
      owner: {
        login: binding.installation.accountLogin,
        avatar_url: `https://github.com/${binding.installation.accountLogin}.png`,
      },
      private: false,
      fork: true,
      updated_at: binding.installation.updatedAt.toISOString(),
      installationId: binding.installation.installationId,
    },
    createdAt: binding.createdAt.toISOString(),
  };
}

// Get available repositories from user's GitHub account and organizations
export async function getAvailableRepositories(): Promise<Repository[]> {
  const user = await getUserInfo();
  if (!user) {
    return [];
  }
  const prisma = getPrismaClient();

  try {
    const userToken = await getUserToken(user.github_id);
    const octokit = new Octokit({ auth: userToken });

    // Get user's repositories with write permissions using pagination
    const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    });

    // Filter repositories with write permissions and are forks
    const writableRepos = repos.filter(repo => 
      (repo.permissions?.push || repo.permissions?.admin || repo.permissions?.maintain) && repo.fork === true
    );

    // Extract full names for database query
    const repoFullNames = writableRepos.map(repo => repo.full_name);

    // Use database query to find installations that match the writable repositories
    const installations = await prisma.gitHubInstallation.findMany({
      where: {
        repositoryName: {
          not: null,
        },
        // Use SQL to match full names efficiently
        OR: repoFullNames.map(fullName => {
          const [owner, name] = fullName.split('/');
          return {
            accountLogin: owner,
            repositoryName: name,
          };
        }),
      },
    });

    // Create a map of installations for quick lookup
    const installationMap = new Map(
      installations.map(installation => [
        `${installation.accountLogin}/${installation.repositoryName}`,
        installation
      ])
    );

    // Convert matching repositories to Repository format
    const availableRepositories: Repository[] = writableRepos
      .filter(repo => installationMap.has(repo.full_name))
      .map(repo => {
        const installation = installationMap.get(repo.full_name);
        if (!installation) {
          throw new Error(`Installation not found for ${repo.full_name}`);
        }
        return {
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          owner: {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url,
          },
          private: repo.private,
          fork: repo.fork,
          updated_at: repo.updated_at || new Date().toISOString(),
          installationId: installation.installationId,
        };
      });

    return availableRepositories;
  } catch (error) {
    console.error('Error fetching available repositories:', error);
    throw new Error('Failed to fetch repositories');
  }
}

// Bind a repository to the current user
export async function bindRepository(installationId: string): Promise<void> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录，请先登录');
  }
  const prisma = getPrismaClient();

  try {
    // Find the installation
    const installation = await prisma.gitHubInstallation.findUnique({
      where: {
        installationId: installationId,
      },
    });

    if (!installation) {
      throw new Error('Installation not found');
    }

    // Find the user
    const dbUser = await prisma.user.findUnique({
      where: {
        githubUserId: user.github_id,
      },
    });

    if (!dbUser) {
      throw new Error('User not found');
    }

    // Delete existing binding for this user (if any)
    await prisma.repositoryBinding.deleteMany({
      where: {
        userId: dbUser.id,
      },
    });

    // Create new binding
    await prisma.repositoryBinding.create({
      data: {
        userId: dbUser.id,
        installationId: installation.id,
      },
    });

    console.log(`Repository bound: ${installation.accountLogin}/${installation.repositoryName} for user ${user.username}`);
  } catch (error) {
    console.error('Error binding repository:', error);
    throw new Error('Failed to bind repository');
  }
}

// Helper function to get user token
async function getUserToken(githubUserId: string): Promise<string> {
  const prisma = getPrismaClient();
  
  const user = await prisma.user.findUnique({
    where: {
      githubUserId: githubUserId,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user.accessToken;
}

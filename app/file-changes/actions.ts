'use server';

import { requireAuth, getUserInfo } from '@/lib/auth';
import { getPrismaClient } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { Octokit } from '@octokit/rest';
import { parse } from 'yaml';

export interface FileChangeData {
  filename: string;
  md5Hash: string;
  status: 'created' | 'modified' | 'deleted';
  content: string;
  previousContent?: string;
}

export interface FileChangeResult {
  id: number;
  filename: string;
  md5Hash: string;
  status: string;
  content: string;
  previousContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createFileChange(data: FileChangeData): Promise<FileChangeResult> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录，请先登录');
  }
  const prisma = getPrismaClient();

  // Check if a file change already exists for this MD5 hash by this user
  const existingChange = await prisma.fileChange.findFirst({
    where: {
      userId: parseInt(user.sub),
      md5Hash: data.md5Hash,
    },
  });

  let fileChange;
  
  if (existingChange) {
    // Update existing file change
    fileChange = await prisma.fileChange.update({
      where: { id: existingChange.id },
      data: {
        filename: data.filename,
        status: data.status,
        content: data.content,
        previousContent: data.previousContent || existingChange.content,
        updatedAt: new Date(),
      },
    });
  } else {
    // Create new file change
    fileChange = await prisma.fileChange.create({
      data: {
        userId: parseInt(user.sub),
        filename: data.filename,
        md5Hash: data.md5Hash,
        status: data.status,
        content: data.content,
        previousContent: data.previousContent,
      },
    });
  }

  revalidatePath('/');

  return {
    id: fileChange.id,
    filename: fileChange.filename,
    md5Hash: fileChange.md5Hash,
    status: fileChange.status,
    content: fileChange.content,
    previousContent: fileChange.previousContent,
    createdAt: fileChange.createdAt.toISOString(),
    updatedAt: fileChange.updatedAt.toISOString(),
  };
}

export async function getUserFileChanges(): Promise<FileChangeResult[]> {
  const user = await getUserInfo();
  if (!user) {
    // Return empty array for unauthenticated users
    return [];
  }
  const prisma = getPrismaClient();

  const fileChanges = await prisma.fileChange.findMany({
    where: { userId: parseInt(user.sub) },
    orderBy: { updatedAt: 'desc' },
  });

  return fileChanges.map(change => ({
    id: change.id,
    filename: change.filename,
    md5Hash: change.md5Hash,
    status: change.status,
    content: change.content,
    previousContent: change.previousContent,
    createdAt: change.createdAt.toISOString(),
    updatedAt: change.updatedAt.toISOString(),
  }));
}

export async function updateFileChange(id: number, content: string): Promise<FileChangeResult> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录，请先登录');
  }
  const prisma = getPrismaClient();

  const fileChange = await prisma.fileChange.findFirst({
    where: {
      id,
      userId: parseInt(user.sub),
    },
  });

  if (!fileChange) {
    throw new Error('File change not found');
  }

  const updatedChange = await prisma.fileChange.update({
    where: { id },
    data: {
      content,
      updatedAt: new Date(),
    },
  });

  revalidatePath('/');

  return {
    id: updatedChange.id,
    filename: updatedChange.filename,
    md5Hash: updatedChange.md5Hash,
    status: updatedChange.status,
    content: updatedChange.content,
    previousContent: updatedChange.previousContent,
    createdAt: updatedChange.createdAt.toISOString(),
    updatedAt: updatedChange.updatedAt.toISOString(),
  };
}

export async function deleteFileChange(id: number): Promise<void> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录，请先登录');
  }
  const prisma = getPrismaClient();

  const fileChange = await prisma.fileChange.findFirst({
    where: {
      id,
      userId: parseInt(user.sub),
    },
  });

  if (!fileChange) {
    throw new Error('File change not found');
  }

  await prisma.fileChange.delete({
    where: { id },
  });

  revalidatePath('/');
}

// Step 1: Check repository binding and return binding info
export async function checkRepositoryBinding(): Promise<{
  repoOwner: string;
  repoName: string;
  userToken: string;
  error?: string;
}> {
  try {
    const user = await getUserInfo();
    if (!user) {
      return {
        repoOwner: '',
        repoName: '',
        userToken: '',
        error: '用户未登录，请先登录并绑定仓库',
      };
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
      return {
        repoOwner: '',
        repoName: '',
        userToken: '',
        error: '请先绑定仓库',
      };
    }

    return {
      repoOwner: binding.installation.accountLogin,
      repoName: binding.installation.repositoryName || process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME,
      userToken: binding.user.accessToken,
    };
  } catch (error) {
    console.error('Error checking repository binding:', error);
    return {
      repoOwner: '',
      repoName: '',
      userToken: '',
      error: error instanceof Error ? error.message : '检查仓库绑定失败',
    };
  }
}

// Step 2: Sync with upstream repository
export async function syncUpstreamRepository(
  userToken: string,
  repoOwner: string,
  repoName: string
): Promise<{ error?: string }> {
  try {
    const octokit = new Octokit({ auth: userToken });
    const upstreamOwner = process.env.NEXT_PUBLIC_ARCHIVE_REPO_OWNER;
    const upstreamRepo = process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME;

    await syncWithUpstream(octokit, repoOwner, repoName, upstreamOwner, upstreamRepo);
    return {};
  } catch (error) {
    console.error('Error syncing upstream:', error);
    return { error: error instanceof Error ? error.message : '同步上游仓库失败' };
  }
}

// Step 3: Create new branch
export async function createCommitBranch(
  userToken: string,
  repoOwner: string,
  repoName: string
): Promise<{ branchName?: string; error?: string }> {
  try {
    const user = await getUserInfo();
    if (!user) {
      return { error: '用户未登录，请先登录' };
    }
    const octokit = new Octokit({ auth: userToken });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const branchName = `${user.username}-${timestamp}`;

    await createBranch(octokit, repoOwner, repoName, branchName);
    return { branchName };
  } catch (error) {
    console.error('Error creating branch:', error);
    return { error: error instanceof Error ? error.message : '创建分支失败' };
  }
}

// Step 4: Commit files to branch
export async function commitFilesToNewBranch(
  userToken: string,
  repoOwner: string,
  repoName: string,
  branchName: string
): Promise<{ error?: string }> {
  try {
    const user = await getUserInfo();
    if (!user) {
      return { error: '用户未登录，请先登录' };
    }
    const prisma = getPrismaClient();
    const octokit = new Octokit({ auth: userToken });

    // Get all file changes for this user
    const fileChanges = await prisma.fileChange.findMany({
      where: { userId: parseInt(user.sub) },
      orderBy: { updatedAt: 'desc' },
    });

    if (fileChanges.length === 0) {
      return { error: '没有文件变更需要提交' };
    }

    await commitFilesToBranch(octokit, repoOwner, repoName, branchName, fileChanges);
    return {};
  } catch (error) {
    console.error('Error committing files:', error);
    return { error: error instanceof Error ? error.message : '提交文件失败' };
  }
}

// Step 5: Create pull request and clean up
export async function createPullRequestAndCleanup(
  userToken: string,
  repoOwner: string,
  branchName: string
): Promise<{ prUrl?: string; error?: string }> {
  try {
    const user = await getUserInfo();
    if (!user) {
      return { error: '用户未登录，请先登录' };
    }
    const prisma = getPrismaClient();
    const octokit = new Octokit({ auth: userToken });

    // Get file changes for PR message
    const fileChanges = await prisma.fileChange.findMany({
      where: { userId: parseInt(user.sub) },
      orderBy: { updatedAt: 'desc' },
    });

    if (fileChanges.length === 0) {
      return { error: '没有文件变更需要提交' };
    }

    const upstreamOwner = process.env.NEXT_PUBLIC_ARCHIVE_REPO_OWNER;
    const upstreamRepo = process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME;

    // Create PR
    const { title, body } = generateCommitMessage(fileChanges);
    const prUrl = await createPullRequest(octokit, upstreamOwner, upstreamRepo, repoOwner, branchName, title, body);

    // Clear file changes from database
    await prisma.fileChange.deleteMany({
      where: { userId: parseInt(user.sub) },
    });

    revalidatePath('/');
    return { prUrl };
  } catch (error) {
    console.error('Error creating PR:', error);
    return { error: error instanceof Error ? error.message : '创建 Pull Request 失败' };
  }
}

export async function revertAllFileChanges(): Promise<void> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录，请先登录');
  }
  const prisma = getPrismaClient();

  await prisma.fileChange.deleteMany({
    where: { userId: parseInt(user.sub) },
  });

  revalidatePath('/');
}

// Helper function to sync with upstream repository
async function syncWithUpstream(
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  upstreamOwner: string,
  upstreamRepo: string
): Promise<void> {
  try {
    // Get the latest commit from upstream main branch
    const { data: upstreamCommit } = await octokit.rest.repos.getBranch({
      owner: upstreamOwner,
      repo: upstreamRepo,
      branch: 'master',
    });

    // Update the main branch to match upstream
    await octokit.rest.git.updateRef({
      owner: repoOwner,
      repo: repoName,
      ref: 'heads/master',
      sha: upstreamCommit.commit.sha,
    });
  } catch (error) {
    console.error('Error syncing with upstream:', error);
    throw new Error('Failed to sync with upstream repository');
  }
}

// Helper function to create a new branch
async function createBranch(
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  branchName: string
): Promise<void> {
  try {
    // Get the latest commit from main branch
    const { data: mainBranch } = await octokit.rest.repos.getBranch({
      owner: repoOwner,
      repo: repoName,
      branch: 'master',
    });

    // Create new branch from main
    await octokit.rest.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: mainBranch.commit.sha,
    });
  } catch (error) {
    console.error('Error creating branch:', error);
    throw new Error('Failed to create new branch');
  }
}

// Helper function to commit files to a branch
async function commitFilesToBranch(
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  branchName: string,
  fileChanges: any[]
): Promise<void> {
  try {
    // Get the latest commit from the branch
    const { data: branch } = await octokit.rest.repos.getBranch({
      owner: repoOwner,
      repo: repoName,
      branch: branchName,
    });

    // Prepare file changes for commit
    const changes: any[] = [];
    
    for (const fileChange of fileChanges) {
      const filePath = `metadata/${fileChange.filename}`;
      
      if (fileChange.status === 'deleted') {
        // For deleted files, we need to remove them
        changes.push({
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: null, // null indicates deletion
        });
      } else {
        // For created and modified files, create blob and add to tree
        const { data: blob } = await octokit.rest.git.createBlob({
          owner: repoOwner,
          repo: repoName,
          content: Buffer.from(fileChange.content).toString('base64'),
          encoding: 'base64',
        });

        changes.push({
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        });
      }
    }

    // Create new tree
    const { data: newTree } = await octokit.rest.git.createTree({
      owner: repoOwner,
      repo: repoName,
      base_tree: branch.commit.commit.tree.sha,
      tree: changes,
    });

    // Generate commit message
    const { title, body } = generateCommitMessage(fileChanges);

    // Create commit
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner: repoOwner,
      repo: repoName,
      message: `${title}\n\n${body}`,
      tree: newTree.sha,
      parents: [branch.commit.sha],
    });

    // Update branch reference
    await octokit.rest.git.updateRef({
      owner: repoOwner,
      repo: repoName,
      ref: `heads/${branchName}`,
      sha: newCommit.sha,
    });
  } catch (error) {
    console.error('Error committing files:', error);
    throw new Error('Failed to commit files to branch');
  }
}

// Helper function to create a pull request
async function createPullRequest(
  octokit: Octokit,
  upstreamOwner: string,
  upstreamRepo: string,
  repoOwner: string,
  branchName: string,
  title: string,
  body: string
): Promise<string> {
  try {
    console.log('Creating PR with params:', {
      upstreamOwner,
      upstreamRepo,
      repoOwner,
      branchName,
      title,
      head: `${repoOwner}:${branchName}`,
      base: 'master'
    });
    
    const { data: pr } = await octokit.rest.pulls.create({
      owner: upstreamOwner,
      repo: upstreamRepo,
      title,
      body,
      head: `${repoOwner}:${branchName}`,
      base: 'master',
    });
    
    console.log('PR created successfully:', pr.html_url);
    return pr.html_url;
  } catch (error) {
    console.error('Error creating pull request:', error);
    if (error instanceof Error) {
      throw new Error(`创建 Pull Request 失败: ${error.message}`);
    }
    throw new Error('创建 Pull Request 失败: 未知错误');
  }
}

// Helper function to generate commit message and PR title/body
function generateCommitMessage(fileChanges: any[]): { title: string; body: string } {
  const created = fileChanges.filter(f => f.status === 'created');
  const modified = fileChanges.filter(f => f.status === 'modified');
  const deleted = fileChanges.filter(f => f.status === 'deleted');

  // Generate title
  let title = '';
  
  // If only one file is changed, use detailed filename
  if (fileChanges.length === 1) {
    const file = fileChanges[0];
    const displayName = generateDisplayName(file);
    
    if (file.status === 'created') {
      title = `创建了${displayName}`;
    } else if (file.status === 'modified') {
      title = `修改了${displayName}`;
    } else if (file.status === 'deleted') {
      title = `删除了${displayName}`;
    }
  } else {
    // Multiple files, use count-based description
    const operations: string[] = [];
    
    if (created.length > 0) {
      operations.push(`创建了 ${created.length} 个文件`);
    }
    if (modified.length > 0) {
      operations.push(`修改了 ${modified.length} 个文件`);
    }
    if (deleted.length > 0) {
      operations.push(`删除了 ${deleted.length} 个文件`);
    }
    
    title = operations.join('，');
  }

  // Generate body
  const bodyLines: string[] = [];
  
  created.forEach(file => {
    const displayName = generateDisplayName(file);
    bodyLines.push(`- 创建了 ${displayName}`);
  });
  
  modified.forEach(file => {
    const displayName = generateDisplayName(file);
    bodyLines.push(`- 修改了 ${displayName}`);
  });
  
  deleted.forEach(file => {
    const displayName = generateDisplayName(file);
    bodyLines.push(`- 删除了 ${displayName}`);
  });

  // Add signature line
  bodyLines.push('');
  bodyLines.push(`*使用 [BYR Docs Publish](${process.env.NEXT_PUBLIC_PUBLISH_SITE_URL}) 发布*`);
  
  return { title, body: bodyLines.join('\n') };
}

// Helper function to generate display name for files
function generateDisplayName(fileChange: any): string {
  try {
    // Parse YAML content to get metadata
    const data = parse(fileChange.content);
    
    if (!data || !data.type) {
      return fileChange.filename;
    }

    // For books and docs, use title
    if (data.type === 'book' || data.type === 'doc') {
      return data.data?.title || fileChange.filename;
    }

    // For tests, generate title based on time and course info
    if (data.type === 'test' && data.data) {
      const testData = data.data;
      let time = testData.time?.start || '';
      
      if (testData.time?.start && testData.time?.end && testData.time.start !== testData.time.end) {
        time = `${testData.time.start}-${testData.time.end}`;
      }
      
      const semester = testData.time?.semester === 'First' ? ' 第一学期' : 
                       testData.time?.semester === 'Second' ? ' 第二学期' : '';
      
      const courseName = testData.course?.name || '';
      const stage = testData.time?.stage ? ' ' + testData.time.stage : '';
      
      const isAnswerOnly = testData.content?.length === 1 && testData.content[0] === '答案';
      const contentType = isAnswerOnly ? '答案' : '试卷';
      
      return `${time}${semester} ${courseName}${stage}${contentType}`;
    }

    return fileChange.filename;
  } catch (error) {
    // If parsing fails, return filename
    return fileChange.filename;
  }
}

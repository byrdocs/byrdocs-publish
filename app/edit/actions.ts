'use server';

import { requireAuth, getUserInfo } from '@/lib/auth';
import { getPrismaClient } from '@/lib/db';
import { FormData } from '@/lib/types';
import { FileChange } from '@/lib/diff';
import { revalidatePath } from 'next/cache';
import { generateYaml } from '@/lib/yaml';

interface MetadataFile extends FormData {
  // FormData already has id, url, type, data
}

interface MergedFile extends FileChange {
  // FileChange already has content and previousContent
}

// Cache for metadata2.json to avoid repeated fetches
let metadataCache: MetadataFile[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getMetadataFiles(): Promise<MetadataFile[]> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (metadataCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return metadataCache;
  }
  
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_R2_DATA_SITE_URL}/metadata.json`);
    const data = await response.json() as MetadataFile[];
    
    // Cache the data
    metadataCache = data;
    cacheTimestamp = now;
    
    return data;
  } catch (error) {
    console.error('Failed to fetch metadata:', error);
    return [];
  }
}

export async function getUserFileChangesForEdit() {
  const user = await getUserInfo();
  if (!user) {
    return [];
  }
  
  const prisma = getPrismaClient();
  const changes = await prisma.fileChange.findMany({
    where: { userId: parseInt(user.sub) },
  });
  
  return changes;
}

export async function mergeFilesWithChanges(): Promise<MergedFile[]> {
  await requireAuth();
  
  // Fetch both data sources in parallel
  const [metadataFiles, dbChanges] = await Promise.all([
    getMetadataFiles(),
    getUserFileChangesForEdit()
  ]);
  
  // Create a map of database changes by MD5 hash
  const changesMap = new Map(dbChanges.map(change => [change.md5Hash, change]));
  
  // Create a map of metadata files for easy lookup
  const metadataMap = new Map(metadataFiles.map(file => [file.id, file]));
  
  const mergedFiles: MergedFile[] = [];
  
  // Helper function to detect conflicts
  const detectConflict = async (metaFile: MetadataFile, change: any) => {
    if (change.status === 'created') {
      // Conflict if metadata file exists but we also have a created record
      return { hasConflict: true, conflictType: 'content' as const };
    }
    
    if (change.status === 'deleted') {
      // Generate current metadata YAML to compare with what was expected to be deleted
      try {
        const { generateYaml } = await import('@/lib/yaml');
        const currentMetadataYaml = generateYaml(metaFile.type, metaFile);
        const expectedDeletedContent = change.previousContent || '';
        
        // Conflict if the content in metadata is different from what was expected to be deleted
        if (currentMetadataYaml.trim() !== expectedDeletedContent.trim()) {
          console.log("currentMetadataYaml", currentMetadataYaml)
          console.log("expectedDeletedContent", expectedDeletedContent)
          return { hasConflict: true, conflictType: 'deletion' as const };
        }
      } catch (error) {
        console.error('Failed to generate metadata YAML for conflict detection:', error);
      }
    }
    
    return { hasConflict: false, conflictType: undefined };
  };
  
  // Process metadata files
  for (const metaFile of metadataFiles) {
    const change = changesMap.get(metaFile.id);
    
    if (change) {
      const conflict = await detectConflict(metaFile, change);
      
      if (change.status === 'deleted') {
        // Add deleted file to the list with conflict detection
        // Generate current content from metadata for comparison
        const { generateYaml } = await import('@/lib/yaml');
        const currentContent = generateYaml(metaFile.type, metaFile);
        
        mergedFiles.push({
          id: metaFile.id,
          filename: `${metaFile.id}.yml`,
          status: 'deleted',
          content: currentContent, // Current content from metadata (shows what actually exists)
          previousContent: change.previousContent || undefined,
          timestamp: new Date(change.updatedAt),
          canRevert: true,
          hasConflict: conflict.hasConflict,
          conflictType: conflict.conflictType,
        });
      } else if (change.status === 'modified') {
        // Modified file - generate previous content from metadata if not stored
        let previousContent = change.previousContent;
        if (!previousContent) {
          const { generateYaml } = await import('@/lib/yaml');
          previousContent = generateYaml(metaFile.type, metaFile);
        }
        
        mergedFiles.push({
          id: metaFile.id,
          filename: `${metaFile.id}.yml`,
          status: 'modified',
          content: change.content, // New content from database
          previousContent,
          timestamp: new Date(change.updatedAt),
          canRevert: true,
        });
      } else if (change.status === 'created') {
        // Conflict: file exists in both metadata and as a created record
        mergedFiles.push({
          id: metaFile.id,
          filename: `${metaFile.id}.yml`,
          status: 'created',
          content: change.content, // Content from database
          timestamp: new Date(change.updatedAt),
          canRevert: true,
          hasConflict: conflict.hasConflict,
          conflictType: conflict.conflictType,
        });
      }
    } else {
      // Unchanged file (not in database) - generate content from metadata
      const { generateYaml } = await import('@/lib/yaml');
      const content = generateYaml(metaFile.type, metaFile);
      
      mergedFiles.push({
        id: metaFile.id,
        filename: `${metaFile.id}.yml`,
        status: 'unchanged',
        content,
        timestamp: new Date(), // Current time for unchanged files
        canRevert: false, // Cannot revert unchanged files
      });
    }
  }
  
  // Add newly created files from database that don't exist in metadata
  const createdChanges = dbChanges.filter(change => 
    change.status === 'created' && !metadataMap.has(change.md5Hash)
  );
  
  for (const change of createdChanges) {
    mergedFiles.push({
      id: change.md5Hash,
      filename: change.filename,
      status: 'created',
      content: change.content, // Include content for created files
      timestamp: new Date(change.updatedAt),
      canRevert: true,
    });
  }
  
  // Sort: modified files first, then by ID in dictionary order
  mergedFiles.sort((a, b) => {
    // First priority: modified files (created, modified, deleted) come before unchanged
    const aIsModified = a.status !== 'unchanged';
    const bIsModified = b.status !== 'unchanged';
    
    if (aIsModified && !bIsModified) return -1;
    if (!aIsModified && bIsModified) return 1;
    
    // Second priority: sort by ID in dictionary order
    return a.id.localeCompare(b.id);
  });
  
  return mergedFiles;
}

export async function deleteFile(fileId: string): Promise<void> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录');
  }
  
  const prisma = getPrismaClient();
  
  // Check if this is a metadata file
  const metadataFiles = await getMetadataFiles();
  const metaFile = metadataFiles.find(f => f.id === fileId);
  
  if (metaFile) {
    // This is a metadata file, create a delete record
    const existingChange = await prisma.fileChange.findFirst({
      where: {
        userId: parseInt(user.sub),
        md5Hash: fileId,
      },
    });
    
    if (existingChange) {
      // Update existing record to deleted
      await prisma.fileChange.update({
        where: { id: existingChange.id },
        data: {
          status: 'deleted',
          updatedAt: new Date(),
          content: '',
          previousContent: generateYaml(metaFile.type, metaFile),
        },
      });
    } else {
      // Create new delete record
      await prisma.fileChange.create({
        data: {
          userId: parseInt(user.sub),
          filename: `${fileId}.yml`,
          md5Hash: fileId,
          status: 'deleted',
          content: '', // Empty content for deleted files
          previousContent: generateYaml(metaFile.type, metaFile),
        },
      });
    }
  } else {
    // This is a created file, just delete the record
    const change = await prisma.fileChange.findFirst({
      where: {
        userId: parseInt(user.sub),
        md5Hash: fileId,
      },
    });
    
    if (change) {
      await prisma.fileChange.delete({
        where: { id: change.id },
      });
    }
  }
  
  revalidatePath('/edit');
}

export async function revertFileChange(fileId: string): Promise<void> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录');
  }
  
  const prisma = getPrismaClient();
  
  // Find and delete the change record
  const change = await prisma.fileChange.findFirst({
    where: {
      userId: parseInt(user.sub),
      md5Hash: fileId,
    },
  });
  
  if (change) {
    await prisma.fileChange.delete({
      where: { id: change.id },
    });
  }
  
  revalidatePath('/edit');
}

export async function createOrUpdateFileChange(
  fileId: string,
  yamlContent: string,
  isNew: boolean = false
): Promise<void> {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('用户未登录');
  }
  
  const prisma = getPrismaClient();
  
  if (isNew) {
    // Create new file
    await prisma.fileChange.create({
      data: {
        userId: parseInt(user.sub),
        filename: `${fileId}.yml`,
        md5Hash: fileId,
        status: 'created',
        content: yamlContent,
      },
    });
  } else {
    // Update existing file
    const existingChange = await prisma.fileChange.findFirst({
      where: {
        userId: parseInt(user.sub),
        md5Hash: fileId,
      },
    });
    
    if (existingChange) {
      // Update existing change
      await prisma.fileChange.update({
        where: { id: existingChange.id },
        data: {
          content: yamlContent,
          status: existingChange.status === 'created' ? 'created' : 'modified',
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new modification record
      const metadataFiles = await getMetadataFiles();
      const originalFile = metadataFiles.find(f => f.id === fileId);
      
      if (originalFile) {
        // Generate original YAML for comparison
        const { generateYaml } = await import('@/lib/yaml');
        const originalYaml = generateYaml(originalFile.type, originalFile);
        
        await prisma.fileChange.create({
          data: {
            userId: parseInt(user.sub),
            filename: `${fileId}.yml`,
            md5Hash: fileId,
            status: 'modified',
            content: yamlContent,
            previousContent: originalYaml,
          },
        });
      }
    }
  }
  
  revalidatePath('/edit');
}

export async function handleFileReupload(
  originalFileId: string,
  newFileId: string,
  yamlContent: string
): Promise<void> {
  await requireAuth();
  
  // First, delete the original file record
  await deleteFile(originalFileId);
  
  // Then create a new file record with the new MD5
  await createOrUpdateFileChange(newFileId, yamlContent, true);
  
  revalidatePath('/edit');
}

export async function getFileById(fileId: string): Promise<MergedFile | null> {
  await requireAuth();
  
  // Get all merged files and find the specific one
  const allFiles = await mergeFilesWithChanges();
  return allFiles.find(file => file.id === fileId) || null;
}

export async function discardChanges(fileId: string): Promise<void> {
  await requireAuth();
  const user = await getUserInfo();
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const prisma = getPrismaClient();
  
  // Delete the FileChange record to discard changes
  await prisma.fileChange.deleteMany({
    where: {
      md5Hash: fileId,
      userId: parseInt(user.sub),
    }
  });
  
  revalidatePath('/edit');
}

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, ButtonKbd } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GitCommit, Upload, RotateCcw, AlertCircle, Loader2, Link2 } from "lucide-react"
import { FileChangeItem } from "./file-change-item"
import type { FileChange } from "@/lib/diff"
import { 
  getUserFileChanges, 
  updateFileChange, 
  deleteFileChange, 
  checkRepositoryBinding,
  syncUpstreamRepository,
  createCommitBranch,
  commitFilesToNewBranch,
  createPullRequestAndCleanup,
  revertAllFileChanges,
  type FileChangeResult 
} from "@/app/file-changes/actions"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PrSuccessDialog } from "./pr-success-dialog"

// Convert database result to FileChange format
function convertToFileChange(result: FileChangeResult): FileChange {
  return {
    id: result.id.toString(),
    filename: result.filename,
    status: result.status as "created" | "modified" | "deleted",
    content: result.content,
    previousContent: result.previousContent || undefined,
    timestamp: new Date(result.updatedAt),
    canRevert: true,
  };
}

export function FileChanges() {
  const { user, binding, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [fileChanges, setFileChanges] = useState<FileChange[] | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showRevertDialog, setShowRevertDialog] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitStep, setCommitStep] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [showPrSuccessDialog, setShowPrSuccessDialog] = useState(false)


  // Load file changes from database
  useEffect(() => {
    const loadFileChanges = async () => {
      if (!user) {
        setIsLoading(false)
        setFileChanges([])
        return
      }

      try {
        setIsLoading(true)
        const results = await getUserFileChanges()
        const changes = results.map(convertToFileChange)
        setFileChanges(changes)
      } catch (error) {
        console.error('Failed to load file changes:', error)
        // Fallback to empty array
        setFileChanges([])
      } finally {
        setIsLoading(false)
      }
    }

    if (!authLoading) {
      loadFileChanges()
    }
  }, [user, authLoading])

  const handleUpdateFile = async (id: string, content: string) => {
    try {
      const result = await updateFileChange(parseInt(id), content)
      const updatedChange = convertToFileChange(result)
      setFileChanges((prev) => prev && prev.map((file) => 
        file.id === id ? updatedChange : file
      ))
    } catch (error) {
      console.error('Failed to update file:', error)
    }
  }

  const handleRevertFile = async (id: string) => {
    try {
      await deleteFileChange(parseInt(id))
      setFileChanges((prev) => prev && prev.filter((file) => file.id !== id))
    } catch (error) {
      console.error('Failed to revert file:', error)
    }
  }

  const handleRevertAll = async () => {
    try {
      await revertAllFileChanges()
      setFileChanges([])
      setShowRevertDialog(false)
    } catch (error) {
      console.error('Failed to revert all files:', error)
    }
  }

  const openRevertDialog = () => {
    setShowRevertDialog(true)
  }

  const handleCommit = async () => {
    try {
      setIsCommitting(true)
      setCommitError(null)
      setPrUrl(null)
      
      // Step 1: 检查仓库绑定
      setCommitStep('检查仓库绑定...')
      const bindingResult = await checkRepositoryBinding()
      if (bindingResult.error) {
        setCommitError(bindingResult.error)
        setCommitStep(null)
        return
      }
      
      const { repoOwner, repoName, userToken } = bindingResult
      
      // Step 2: 同步上游仓库
      setCommitStep('同步上游仓库...')
      const syncResult = await syncUpstreamRepository(userToken, repoOwner, repoName)
      if (syncResult.error) {
        setCommitError(syncResult.error)
        setCommitStep(null)
        return
      }
      
      // Step 3: 创建新分支
      setCommitStep('创建新分支...')
      const branchResult = await createCommitBranch(userToken, repoOwner, repoName)
      if (branchResult.error) {
        setCommitError(branchResult.error)
        setCommitStep(null)
        return
      }
      
      const { branchName } = branchResult
      if (!branchName) {
        setCommitError('创建分支失败：未返回分支名称')
        setCommitStep(null)
        return
      }
      
      // Step 4: 提交文件变更
      setCommitStep('提交文件变更...')
      const commitResult = await commitFilesToNewBranch(userToken, repoOwner, repoName, branchName)
      if (commitResult.error) {
        setCommitError(commitResult.error)
        setCommitStep(null)
        return
      }
      
      // Step 5: 创建 Pull Request
      setCommitStep('创建 Pull Request...')
      const prResult = await createPullRequestAndCleanup(userToken, repoOwner, branchName)
      console.log('PR Result:', prResult)
      if (prResult.error) {
        setCommitError(prResult.error)
        setCommitStep(null)
        return
      }
      
      if (prResult.prUrl) {
        console.log('Showing PR success dialog')
        setCommitStep('提交完成！')
        setPrUrl(prResult.prUrl)
        setShowPrSuccessDialog(true)
        setFileChanges([])
      } else {
        // If no PR URL was returned, show an error
        setCommitError('Pull Request 创建成功但未返回链接')
        setCommitStep(null)
      }
    } catch (error) {
      console.error('Failed to commit files:', error)
      setCommitError(error instanceof Error ? error.message : '提交失败，请稍后重试')
      setCommitStep(null)
    } finally {
      setIsCommitting(false)
    }
  }

  const getChangesSummary = () => {
    if (!fileChanges) {
      return { created: 0, modified: 0, deleted: 0, total: 0 }
    }
    const created = fileChanges.filter((f) => f.status === "created").length
    const modified = fileChanges.filter((f) => f.status === "modified").length
    const deleted = fileChanges.filter((f) => f.status === "deleted").length

    return { created, modified, deleted, total: fileChanges.length }
  }

  const { created, modified, deleted, total } = getChangesSummary()

  if (isLoading && fileChanges === null) {
    return (
      <>
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">加载中...</h3>
            <p className="text-gray-500 dark:text-gray-400">正在获取文件变更记录</p>
          </CardContent>
        </Card>
        <PrSuccessDialog
          open={showPrSuccessDialog}
          onOpenChange={setShowPrSuccessDialog}
          prUrl={prUrl}
          onClose={() => {
            setShowPrSuccessDialog(false)
            setPrUrl(null)
          }}
        />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">未登录</h3>
            <p className="text-gray-500 dark:text-gray-400">登录后可以查看和管理您的文件变更</p>
          </CardContent>
        </Card>
        <PrSuccessDialog
          open={showPrSuccessDialog}
          onOpenChange={setShowPrSuccessDialog}
          prUrl={prUrl}
          onClose={() => {
            setShowPrSuccessDialog(false)
            setPrUrl(null)
          }}
        />
      </>
    )
  }

  if (fileChanges && fileChanges.length === 0) {
    return (
      <>
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">暂无文件修改</h3>
            <p className="text-gray-500 dark:text-gray-400">当您修改文件时，更改将在此处显示</p>
          </CardContent>
        </Card>
        <PrSuccessDialog
          open={showPrSuccessDialog}
          onOpenChange={setShowPrSuccessDialog}
          prUrl={prUrl}
          onClose={() => {
            setShowPrSuccessDialog(false)
            setPrUrl(null)
          }}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50 dark:bg-gray-800/50">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                <GitCommit className="h-4 w-4" />
                <span>文件更改</span>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">共 {total} 个文件</span>
                <div className="flex items-center space-x-2">
                  {created > 0 && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      +{created}
                    </Badge>
                  )}
                  {modified > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      ~{modified}
                    </Badge>
                  )}
                  {deleted > 0 && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">-{deleted}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center space-x-2 self-end sm:self-auto">
              <Button variant="destructive" onClick={openRevertDialog} size="sm" disabled={isCommitting}>
                <RotateCcw className="h-4 w-4 mr-1" />
                <span>放弃更改</span>
                <ButtonKbd className="dark:bg-white/10 bg-white/10 dark:text-white/70 text-white/70 dark:border-white/40 border-white/40">r</ButtonKbd>
              </Button>
              {user && binding ? (
                <Button onClick={handleCommit} disabled={isCommitting} className="bg-green-600 hover:bg-green-600/90 dark:bg-green-800 dark:hover:bg-green-800/90 text-white" size="sm">
                  {isCommitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      <span>提交中...</span>
                    </>
                  ) : (
                    <>
                      <GitCommit className="h-4 w-4 mr-1" />
                      <span>提交更改</span>
                      <ButtonKbd className="dark:bg-white/10 bg-white/10 dark:text-white/70 text-white/70 dark:border-white/40 border-white/40">c</ButtonKbd>
                    </>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => router.push(!user ? '/login' : '/bind')} 
                    className="bg-amber-600 hover:bg-amber-600/90 dark:bg-amber-700 dark:hover:bg-amber-700/90 text-white w-full sm:w-auto" 
                    size="sm"
                  >
                    <Link2 className="h-4 w-4 mr-1" />
                    <span>{!user ? '登录' : '绑定仓库'}</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress display during commit */}
      {isCommitting && commitStep && (
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="py-4">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
              <span className="text-blue-800 dark:text-blue-200 font-medium">{commitStep}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {commitError && (
        <Card className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
          <CardContent className="py-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <span className="text-red-800 dark:text-red-200 font-medium">{commitError}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCommitError(null)}
              className="mt-3"
            >
              知道了
            </Button>
          </CardContent>
        </Card>
      )}


      <div className="space-y-3">
        {fileChanges && fileChanges.map((fileChange) => (
          <FileChangeItem
            key={fileChange.id}
            fileChange={fileChange}
            onUpdate={handleUpdateFile}
            onRevert={handleRevertFile}
          />
        ))}
      </div>

      <PrSuccessDialog
        open={showPrSuccessDialog}
        onOpenChange={setShowPrSuccessDialog}
        prUrl={prUrl}
        onClose={() => {
          setShowPrSuccessDialog(false)
          setPrUrl(null)
        }}
      />

      {/* Revert confirmation dialog */}
      <Dialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认放弃更改</DialogTitle>
            <DialogDescription>
              您确定要放弃所有文件更改吗？此操作将删除所有未提交的更改，且无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowRevertDialog(false)}
            >
              取消
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRevertAll}
            >
              确认放弃
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

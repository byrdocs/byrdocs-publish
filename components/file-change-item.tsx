"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button, ButtonKbd } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronRight, Edit, Save, X, Undo2, FileText, FilePlus, FileX, AlertCircle } from "lucide-react"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { generateDiff, type FileChange } from "@/lib/diff"
import hljs from "highlight.js/lib/core"
import yaml from "highlight.js/lib/languages/yaml"
import { useTheme } from "@/components/theme-provider"
import { CopyButton } from "./copy-button"
import { CodeRenderer } from "./code-renderer"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getStatusConfig } from "../lib/file-status-icon"
import { TransparentButtonKbd } from "@/components/ui/transparent-button-kbd"
import { useTopLoader } from 'nextjs-toploader';
interface FileChangeItemProps {
  fileChange: FileChange
  onUpdate: (id: string, content: string) => Promise<void> | void
  onRevert: (id: string) => void
}

export function FileChangeItem({ fileChange, onUpdate, onRevert }: FileChangeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(fileChange.content || "")
  const [showRevertDialog, setShowRevertDialog] = useState(false)
  const { actualTheme } = useTheme()
  const loader = useTopLoader()
  const router = useRouter()

  // Initialize highlight.js for YAML
  useEffect(() => {
    hljs.registerLanguage("yaml", yaml)
  }, [])

  // Check if file is older than 14 days
  const isFileExpired = () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    return fileChange.timestamp < fourteenDaysAgo
  }

  const statusConfig = getStatusConfig(fileChange.status)
  const StatusIcon = statusConfig.icon

  const handleSave = () => {
    if (onUpdate) {
      const originalContent = fileChange.content || ""
      // Don't save if content hasn't changed or if editContent is empty when originalContent isn't
      if (editContent !== originalContent && (editContent.trim() || !originalContent)) {
        onUpdate(fileChange.id, editContent)
      }
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditContent(fileChange.content || "")
    setIsEditing(false)
  }

  const handleRevert = () => {
    if (onRevert) {
      onRevert(fileChange.id)
    }
  }

  const diff = generateDiff(fileChange.previousContent, fileChange.content || "")

  return (
    <>
    <Card>
      <div className="cursor-pointer" onClick={() => !isEditing && setIsExpanded(!isExpanded)}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 space-y-2 sm:space-y-0">
          <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
            <div className="transition-transform duration-200 flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </div>
            <div className="p-1 sm:p-1.5 flex-shrink-0">
              <StatusIcon className={cn(
                "h-4 w-4 sm:h-5 sm:w-5",
                fileChange.status === 'created' && "text-green-600 dark:text-green-400",
                fileChange.status === 'modified' && "text-amber-600 dark:text-amber-400",
                fileChange.status === 'deleted' && "text-red-600 dark:text-red-400",
                fileChange.status === 'unchanged' && "text-gray-600 dark:text-gray-400"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {fileChange.filename}
                  </span>
                  {isFileExpired() && (
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive" className="flex items-center gap-1 px-2 py-0.5 min-w-[58px]">
                            <AlertCircle className="h-3 w-3" />
                            <span className="text-xs">过期</span>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm font-medium mb-1">文件可能已过期</p>
                          <p className="text-xs text-muted-foreground">
                            该文件上传时间距离现在已经超过 14 天，上传的文件可能已被删除。
                            建议您重新上传文件以确保可用性。
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block sm:mt-0">
                  {fileChange.timestamp.toLocaleString("zh-CN")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400 block sm:hidden">
                {fileChange.timestamp.toLocaleString("zh-CN")}
            </p>
            <div className="flex items-center space-x-1 sm:space-x-2">
                {!isEditing && (
                <CopyButton
                    content={fileChange.content || ""}
                    variant="ghost"
                    className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                    title={`复制${fileChange.status === 'modified' ? '新的' : ''}文件内容`}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
                )}
                {fileChange.status !== "deleted" && !isEditing && (
                <Button
                    size="sm"
                    variant="ghost"
                    title="编辑"
                    onClick={(e) => {
                      e.stopPropagation()
                      loader.start()
                      router.push(`/edit/${fileChange.md5Hash || fileChange.id}`)
                    }}
                    className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                >
                    <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                )}
                {fileChange.canRevert !== false && (
                <Button
                    size="sm"
                    variant="ghost"
                    title="放弃更改"
                    onClick={(e) => {
                    e.stopPropagation()
                    setShowRevertDialog(true)
                    }}
                    className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-orange-600"
                >
                    <Undo2 className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                )}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <CardContent className="pt-0 pb-3 px-3 sm:pb-4 sm:px-4">
          {isEditing ? (
            <div className="space-y-3">
              <div className={cn(
                "relative",
                "yaml-highlight",
                actualTheme === 'dark' ? 'yaml-dark' : 'yaml-light'
              )}>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="font-mono text-sm min-h-[300px] resize-none"
                  placeholder="输入YAML内容..."
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-2">
                <Button size="sm" variant="outline" onClick={handleCancel} className="w-full sm:w-auto">
                  <X className="h-3 w-3 mr-1" />
                  取消
                </Button>
                <Button size="sm" onClick={handleSave} className="w-full sm:w-auto">
                  <Save className="h-3 w-3 mr-1" />
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <CodeRenderer
                content={fileChange.status === "deleted" ? fileChange.previousContent || "" : fileChange.content || ""}
                type={fileChange.status === "deleted" ? "deleted"
                      : fileChange.status === "created" ? "created"
                      : "diff"}
                filename={fileChange.filename}
                actualTheme={actualTheme}
                diff={fileChange.status === "modified" && diff ? diff : undefined}
              />
            </div>
          )}
        </CardContent>
      )}
    </Card>

    {/* Revert confirmation dialog */}
    <Dialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认放弃更改</DialogTitle>
          <DialogDescription>
            您确定要放弃对文件 {fileChange.filename} 的更改吗？此操作无法撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setShowRevertDialog(false)}
          >
            取消
            <ButtonKbd>n</ButtonKbd>
          </Button>
          <Button 
            variant="destructive" 
            onClick={() => {
              handleRevert()
              setShowRevertDialog(false)
            }}
          >
            确认放弃
            <TransparentButtonKbd>y</TransparentButtonKbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  )
}

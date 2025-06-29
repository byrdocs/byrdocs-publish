"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Plus, ArrowRight, Edit } from "lucide-react"
import { FileChanges } from "@/components/file-change"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()
  const handleAddFile = () => {
    router.push("/add")
  }

  const handleManageFiles = () => {
    router.push("/add")
  }

  return (
    <div>
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-12 space-y-8 sm:space-y-12">
        {/* 页面标题 */}
        <div className="text-center space-y-2 sm:space-y-3">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold">BYR Docs Publish</h1>
        </div>

        {/* 主要操作按钮 */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4 sm:gap-6 max-w-4xl mx-auto">
          <Card
            className="cursor-pointer bg-background border-border transition-colors hover:bg-muted/50 group"
            onClick={handleAddFile}
          >
            <CardContent className="p-4 sm:p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="p-2 sm:p-3 bg-muted/50 group-hover:bg-muted rounded-lg transition-colors">
                    <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <span className="text-lg sm:text-xl font-semibold text-foreground">添加文件</span>
                </div>
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer bg-background border-border hover:bg-muted/50 group hidden"
            onClick={handleManageFiles}
          >
            <CardContent className="p-4 sm:p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="p-2 sm:p-3 bg-muted/50 group-hover:bg-muted rounded-lg transition-colors">
                    <Edit className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <span className="text-lg sm:text-xl font-semibold text-foreground">修改文件</span>
                </div>
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 文件修改状态 */}
        <div className="max-w-6xl mx-auto">
          <FileChanges />
        </div>
      </div>
    </div>
  )
}

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Plus, ArrowRight, Edit, ExternalLink } from "lucide-react";
import { FileChanges } from "@/components/file-change";
import { useRouter } from "next/navigation";
import { Button, ButtonKbd, ShortcutProvider } from "@/components/ui/button";
import { useTopLoader } from 'nextjs-toploader';
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const loader = useTopLoader();
  const handleAddFile = () => {
    loader.start();
    router.push("/add");
  };

  const handleManageFiles = () => {
    loader.start();
    router.push("/edit");
  };

  return (
    <ShortcutProvider>
      <div>
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-12 space-y-4 sm:space-y-6">
          {/* 页面标题 */}
          <div className="text-center space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold">
              BYR Docs Publish
            </h1>
            <div className="">
              <p className="text-muted-foreground">
                在提交之前，请您确保您已经阅读并理解
                <Link
                  href={`${process.env.NEXT_PUBLIC_ARCHIVE_REPO_URL}/blob/master/CONTRIBUTING.md`}
                  target="_blank"
                  className="text-blue-500 dark:text-blue-400 hover:underline mx-1 inline-block"
                >
                  <span className="flex items-center justify-center space-x-1">
                    <span className="inline-block">BYR Docs 贡献指南</span>
                    <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 inline-block"/>
                  </span>
                </Link>
                <span className="text-muted-foreground">与</span>
                <Link
                  href={`${process.env.NEXT_PUBLIC_ARCHIVE_REPO_URL}/blob/master/docs/%E6%96%87%E4%BB%B6%E8%A7%84%E5%88%99.md#%E6%96%87%E4%BB%B6%E6%94%B6%E5%BD%95%E8%A7%84%E5%88%99`}
                  target="_blank"
                  className="text-blue-500 dark:text-blue-400 hover:underline mx-1 inline-block"
                >
                  <span className="flex items-center justify-center space-x-1">
                    <span className="inline-block">BYR Docs 文件收录规则</span>
                    <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 inline-block"/>
                  </span>
                </Link>
              </p>
            </div>
          </div>

          {/* 主要操作按钮 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
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
                    <div className="flex items-center">
                      <span className="text-lg sm:text-xl font-semibold text-foreground">
                        添加文件
                      </span>
                      <Button onClick={handleAddFile} variant={"ghost"} className="pointer-events-none">
                        <ButtonKbd>1</ButtonKbd>
                      </Button>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer bg-background border-border hover:bg-muted/50 group"
              onClick={handleManageFiles}
            >
              <CardContent className="p-4 sm:p-6 md:p-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className="p-2 sm:p-3 bg-muted/50 group-hover:bg-muted rounded-lg transition-colors">
                      <Edit className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <div className="flex items-center">
                      <span className="text-lg sm:text-xl font-semibold text-foreground">
                        修改文件
                      </span>
                      <Button onClick={handleManageFiles} variant={"ghost"} className="pointer-events-none">
                        <ButtonKbd>2</ButtonKbd>
                      </Button>
                    </div>
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
    </ShortcutProvider>
  );
}

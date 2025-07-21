"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label, LabelKbd } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonKbd, ShortcutProvider } from "@/components/ui/button";
import { TransparentButtonKbd } from "@/components/ui/transparent-button-kbd";
import { Search, Loader2, AlertCircle, Plus, GitCommit, X } from "lucide-react";
import { FileListItemEnhanced } from "@/components/file-list-item-enhanced";
import { FileChange } from "@/lib/diff";
import { deleteFile, revertFileChange } from "./actions";
import { useDebounce } from "@/hooks/use-debounce";
import { BookData, TestData, DocData } from "@/lib/types";
import { parse } from "yaml";
import Link from "next/link";
import { BackToHome } from "@/components/back-to-home";
import { useRouter } from "next/navigation";

interface EditClientProps {
  initialFiles: FileChange[];
}

const ITEMS_PER_BATCH = 30;

export function EditClient({ initialFiles }: EditClientProps) {
  const [files, setFiles] = useState<FileChange[]>(initialFiles);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayedCount, setDisplayedCount] = useState(ITEMS_PER_BATCH);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const router = useRouter();

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return files;
    }

    const query = debouncedSearchQuery.toLowerCase().trim();

    return files.filter((file) => {
      // Search in ID
      if (file.id.toLowerCase().includes(query)) {
        return true;
      }

      // Search in filename
      if (file.filename.toLowerCase().includes(query)) {
        return true;
      }

      // Search in YAML content if available
      if (file.content) {
        try {
          const yamlData = parse(file.content);
          const data = yamlData.data;

          // Search in title (for books and docs)
          if ("title" in data && data.title?.toLowerCase().includes(query)) {
            return true;
          }

          // Search in course names
          if (yamlData.type === "test") {
            const testData = data as TestData;
            if (testData.course?.name?.toLowerCase().includes(query)) {
              return true;
            }
          } else if (yamlData.type === "doc") {
            const docData = data as DocData;
            if (
              docData.course?.some((c) => c.name?.toLowerCase().includes(query))
            ) {
              return true;
            }
          }

          // Search in authors and ISBN (for books)
          if (yamlData.type === "book") {
            const bookData = data as BookData;
            if (
              bookData.authors?.some((author) =>
                author.toLowerCase().includes(query)
              )
            ) {
              return true;
            }
            // Search in ISBN
            if (
              bookData.isbn?.some((isbn) => isbn.toLowerCase().includes(query))
            ) {
              return true;
            }
          }
        } catch (error) {
          // If YAML parsing fails, skip content search for this file
        }
      }

      return false;
    });
  }, [files, debouncedSearchQuery]);

  // Files to display (with lazy loading)
  const displayedFiles = useMemo(() => {
    return filteredFiles.slice(0, displayedCount);
  }, [filteredFiles, displayedCount]);

  const hasMore = displayedCount < filteredFiles.length;

  // Reset displayed count when search changes
  useEffect(() => {
    setDisplayedCount(ITEMS_PER_BATCH);
  }, [debouncedSearchQuery]);

  // Set up Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          setIsLoadingMore(true);
          // Simulate loading delay for smooth UX
          setTimeout(() => {
            setDisplayedCount((prev) =>
              Math.min(prev + ITEMS_PER_BATCH, filteredFiles.length)
            );
            setIsLoadingMore(false);
          }, 100);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, filteredFiles.length]);

  // Handle file revert
  const handleRevert = useCallback(
    async (id: string) => {
      try {
        // Optimistic update - restore to unchanged status if it was unchanged before
        setFiles(
          (prev) =>
            prev
              .map((file) => {
                if (file.id !== id) return file;

                // If this was originally an unchanged file, restore it to unchanged status
                if (file.status === "deleted" && file.canRevert) {
                  return {
                    ...file,
                    status: "unchanged" as const,
                    canRevert: false,
                    conflictType: undefined,
                    hasConflict: false,
                  };
                }

                if (file.status === "modified" && file.canRevert) {
                  return {
                    ...file,
                    status: "unchanged" as const,
                    canRevert: false,
                    content: file.previousContent,
                    previousContent: undefined,
                    conflictType: undefined,
                    hasConflict: false,
                  };
                }

                // Otherwise, remove it from the list (it was a change)
                return null;
              })
              .filter(Boolean) as FileChange[]
        );

        // Server update
        await revertFileChange(id);
      } catch (error) {
        console.error("Failed to revert file:", error);
        // Revert optimistic update on error
        setFiles(initialFiles);
      }
    },
    [initialFiles]
  );

  // Handle file delete
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        // Find the file to determine how to handle it
        const fileToDelete = files.find((f) => f.id === id);
        if (!fileToDelete) return;

        if (fileToDelete.status === "unchanged") {
          // This is an unchanged file, mark as deleted
          setFiles((prev) =>
            prev.map((file) =>
              file.id === id
                ? { ...file, status: "deleted" as const, canRevert: true }
                : file
            )
          );
        } else {
          // This is a changed file, update its status
          setFiles((prev) =>
            prev.map((file) =>
              file.id === id ? { ...file, status: "deleted" as const } : file
            )
          );
        }

        // Server update
        await deleteFile(id);
      } catch (error) {
        console.error("Failed to delete file:", error);
        // Revert optimistic update on error
        setFiles(initialFiles);
      }
    },
    [files, initialFiles]
  );

  return (
    <ShortcutProvider>
      <div className="space-y-6">
        <BackToHome shortcut="m" />
        {/* Header with Title and Action Buttons */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              编辑文件
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              浏览和编辑 BYRDocs 元数据文件
            </p>
          </div>
          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center space-x-3">
            <Button 
              variant="outline" 
              onClick={() => {
                router.push("/add")
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              新建文件
              <ButtonKbd>n</ButtonKbd>
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-600/90 dark:bg-green-800 dark:hover:bg-green-800/90 text-white"
              onClick={() => {
                router.push("/")
              }}
            >
              <GitCommit className="h-4 w-4 mr-2" />
              提交更改
              <TransparentButtonKbd>c</TransparentButtonKbd>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="search"
                type="text"
                placeholder="搜索文件 ID、标题、课程名称或 ISBN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              <Label htmlFor="search">
                <LabelKbd>s</LabelKbd>
              </Label>
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {searchQuery
                ? `找到 ${filteredFiles.length} 个文件 (共 ${files.length} 个文件)`
                : `共 ${files.length} 个文件`}
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        {filteredFiles.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                未找到文件
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? "尝试调整搜索关键词" : "暂无文件数据"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {displayedFiles.map((file) => (
                <FileListItemEnhanced
                  key={file.id}
                  fileChange={file}
                  onRevert={file.canRevert ? handleRevert : undefined}
                  onDelete={
                    file.status !== "deleted" ? handleDelete : undefined
                  }
                />
              ))}
            </div>

            {/* Load More Trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-4">
                {isLoadingMore ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-gray-500">加载更多...</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">
                    向下滚动加载更多
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ShortcutProvider>
  );
}

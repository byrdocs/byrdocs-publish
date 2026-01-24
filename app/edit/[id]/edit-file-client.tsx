"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, ButtonKbd, ShortcutProvider } from "@/components/ui/button";
import { TransparentButtonKbd } from "@/components/ui/transparent-button-kbd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Upload,
  X,
  AlertCircle,
  ExternalLink,
  Trash2,
  RefreshCw,
  Save,
  ChevronLeft,
} from "lucide-react";
import { getStatusConfig } from "@/lib/file-status-icon";
import { FileChange } from "@/lib/diff";
import { BookData, TestData, DocData, FileType } from "@/lib/types";
import { parse } from "yaml";
import { BookForm } from "@/components/yaml-generator/BookForm";
import { TestForm } from "@/components/yaml-generator/TestForm";
import { DocForm } from "@/components/yaml-generator/DocForm";
import { SimpleFileTypeSelector } from "@/components/yaml-generator/SimpleFileTypeSelector";
import FileUpload from "@/components/file-upload";
import { generateYaml } from "@/lib/yaml";
import { validateISBN } from "@/lib/isbn";
import { validateYear, validateYearRange } from "@/lib/validate";
import {
  handleFileReupload,
  createOrUpdateFileChange,
  deleteFile,
  discardChanges,
} from "../actions";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useArrayManipulation } from "@/hooks/useArrayManipulation";
import { BackToPage } from "@/components/back-to-home";
import { useTopLoader } from 'nextjs-toploader';

interface EditFileClientProps {
  fileChange: FileChange | null;
  courseList: string[];
}

interface AllFileData {
  book: BookData;
  test: TestData;
  doc: DocData;
}

export function EditFileClient({
  fileChange,
  courseList,
}: EditFileClientProps) {
  const router = useRouter();
  const loader = useTopLoader();
  const searchParams = useSearchParams();
  const fromEdit = searchParams.get('from') === 'edit';
  const returnPath = fromEdit ? '/edit' : '/';
  const [formData, setFormData] = useState<any>(null);
  const [allTypeData, setAllTypeData] = useState<AllFileData | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [newFileKey, setNewFileKey] = useState<string>("");
  const [newFileInfo, setNewFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showNoChangesDialog, setShowNoChangesDialog] = useState(false);

  // Parse YAML data when component mounts
  useEffect(() => {
    if (fileChange && fileChange.content) {
      try {
        const yamlData = parse(fileChange.content);
        setFormData(yamlData);

        // Initialize all type data with current data in the correct type
        // and empty data for other types
        const emptyBookData: BookData = {
          title: "",
          authors: [""],
          translators: [],
          edition: "",
          publisher: "",
          publish_year: "",
          isbn: [""],
          filetype: "PDF",
        };

        const emptyTestData: TestData = {
          college: [],
          course: { type: "", name: "" },
          time: { start: "", end: "", semester: "", stage: "" },
          content: [],
          filetype: "PDF",
        };

        const emptyDocData: DocData = {
          title: "",
          course: [{ type: "", name: "" }],
          content: [],
          filetype: "PDF",
        };

        setAllTypeData({
          book: yamlData.type === "book" ? yamlData.data : emptyBookData,
          test: yamlData.type === "test" ? yamlData.data : emptyTestData,
          doc: yamlData.type === "doc" ? yamlData.data : emptyDocData,
        });
      } catch (error) {
        console.error("Failed to parse YAML:", error);
      }
    }
  }, [fileChange?.content]);

  // Validation functions
  const validateCurrentForm = useCallback((): boolean => {
    if (!formData) return false;

    const type = formData.type;
    switch (type) {
      case "book": {
        const data = formData.data as BookData;
        const hasValidISBN = data.isbn.some(
          (isbn) => isbn.trim() && validateISBN(isbn)
        );

        const isValidYear =
          !data.publish_year || validateYear(data.publish_year);

        return !!(
          data.title &&
          data.authors.some((a) => a.trim()) &&
          hasValidISBN &&
          isValidYear
        );
      }
      case "test": {
        const data = formData.data as TestData;

        const yearValidation = validateYearRange(
          data.time.start,
          data.time.end
        );

        return !!(
          data.course.name &&
          data.content.length > 0 &&
          yearValidation.isValid
        );
      }
      case "doc": {
        const data = formData.data as DocData;
        return !!(
          data.title &&
          data.course.length > 0 &&
          data.course.some((c) => c.name?.trim()) &&
          data.content.length > 0
        );
      }
      default:
        return false;
    }
  }, [formData]);

  const getHighlightedFieldIds = useCallback((): string[] => {
    if (!formData) return [];

    const type = formData.type;
    const highlightIds: string[] = [];

    switch (type) {
      case "book":
        const bookData = formData.data as BookData;
        if (!bookData.title?.trim()) highlightIds.push("book-title");
        if (!bookData.authors?.length || !bookData.authors[0]?.trim())
          highlightIds.push("book-authors");
        if (!bookData.isbn?.length || !bookData.isbn[0]?.trim())
          highlightIds.push("book-isbn");
        if (
          bookData.publish_year &&
          !bookData.publish_year.toString().match(/^\d{4}$/)
        ) {
          highlightIds.push("book-publish-year");
        }
        break;
      case "test":
        const testData = formData.data as TestData;
        if (!testData.course?.name?.trim())
          highlightIds.push("test-course-name");
        const yearValidation = validateYearRange(testData.time.start, testData.time.end);
        if (!yearValidation.isValid) {
          highlightIds.push("test-time-range");
        }
        if (!testData.content?.length) highlightIds.push("test-content");
        break;
      case "doc":
        const docData = formData.data as DocData;
        if (!docData.title?.trim()) highlightIds.push("doc-title");
        if (
          !docData.course?.length ||
          !docData.course.some((c) => c.name?.trim())
        ) {
          highlightIds.push("doc-course");
        }
        if (!docData.content?.length) highlightIds.push("doc-content");
        break;
    }

    return highlightIds;
  }, [formData]);

  // Array manipulation helpers
  const { updateArrayItem, removeArrayItem, addArrayItem } = useArrayManipulation(setFormData);

  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle file type change
  const handleTypeChange = (newType: FileType) => {
    if (!formData || !allTypeData || formData.type === newType) return;

    console.log(allTypeData);
    // Save current form data to allTypeData
    const updatedAllTypeData = {
      ...allTypeData,
      [formData.type as keyof AllFileData]: formData.data,
    };
    setAllTypeData(updatedAllTypeData);

    // Switch to new type using stored data
    const newFormData = {
      type: newType,
      data: updatedAllTypeData[newType],
      url: formData.url,
    };

    setFormData(newFormData);
    setHighlightedFields([]);
  };

  // Handle file upload
  const handleFileUploadSuccess = (
    key: string,
    fileInfo?: { name: string; size: number }
  ) => {
    setNewFileKey(key);
    setNewFileInfo(fileInfo || null);
    setShowFileUpload(false);
  };

  // Handle delete
  const handleDelete = async (fileChange: FileChange) => {
    setIsLoading(true);
    try {
      await deleteFile(fileChange.id);
      loader.start()
      router.push(returnPath);
    } catch (error) {
      console.error("Failed to delete file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle discard changes
  const handleDiscardChanges = async (fileChange: FileChange) => {
    setShowDiscardDialog(false);
    setIsLoading(true);
    try {
      await discardChanges(fileChange.id);
      
      if (fileChange.status === 'created') {
        // For newly created files, go back to the return path
        loader.start()
        router.push(returnPath);
      } else {
        // For modified files, refresh the current page
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to discard changes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle restore file (for deleted files)
  const handleRestoreFile = async (fileChange: FileChange) => {
    setShowRestoreDialog(false);
    setIsLoading(true);
    try {
      await discardChanges(fileChange.id);
      router.refresh();
    } catch (error) {
      console.error("Failed to restore file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle save
  const handleSave = async (fileChange: FileChange) => {
    if (!formData || !validateCurrentForm()) {
      const highlightIds = getHighlightedFieldIds();
      setHighlightedFields(highlightIds);

      // Scroll to first error
      if (highlightIds.length > 0) {
        setTimeout(() => {
          const firstHighlightedElement = document.getElementById(
            highlightIds[0]
          );
          if (firstHighlightedElement) {
            firstHighlightedElement.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            const inputElement = firstHighlightedElement.querySelector(
              "input, textarea"
            ) as HTMLInputElement | HTMLTextAreaElement;
            if (inputElement) {
              inputElement.focus();
            }
          }
        }, 100);
      }
      return;
    }

    setIsLoading(true);
    try {
      let finalFormData = formData;

      // If file was re-uploaded, update the URL and ID
      if (newFileKey) {
        // Extract MD5 from newFileKey (format: md5.extension)
        const newMd5 = newFileKey.split('.')[0];
        finalFormData = {
          ...formData,
          id: newMd5,
          url: `${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/files/${newFileKey}`,
        };

        // Handle file re-upload: delete old record and create new one
        const yamlContent = generateYaml(finalFormData.type, finalFormData);
        await handleFileReupload(fileChange.id, newMd5, yamlContent);
      } else {
        // Normal update
        const yamlContent = generateYaml(finalFormData.type, finalFormData);
        
        // Check if content has actually changed
        const originalContent = fileChange.content?.trim() || '';
        const newContent = yamlContent.trim();
        
        if (originalContent === newContent) {
          // No changes made
          setShowNoChangesDialog(true);
          return;
        }
        
        await createOrUpdateFileChange(fileChange.id, yamlContent, false);
      }
      loader.start()
      router.push(returnPath);
    } catch (error) {
      console.error("Failed to save file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle deleted files
  if (!fileChange) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">文件不存在</h2>
          <p className="text-muted-foreground mb-4">找不到指定的文件。</p>
          <Link href={returnPath}>
            <Button variant="outline">{fromEdit ? '返回文件列表' : '返回首页'}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (fileChange.status === 'deleted') {
    return (
      <ShortcutProvider>
        <div className="space-y-6">
          <BackToPage path={returnPath} shortcut="m">{fromEdit ? '返回文件列表' : '返回首页'}</BackToPage>
          
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Trash2 className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-xl font-semibold mb-2">文件已删除</h2>
              <p className="text-muted-foreground mb-4">此文件已被标记为删除，无法编辑。</p>
              <Button
                variant="outline"
                onClick={() => handleRestoreFile(fileChange)}
                disabled={isLoading}
              >
                {isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                恢复文件
              </Button>
            </div>
          </div>
        </div>
      </ShortcutProvider>
    );
  }

  if (!formData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>加载文件数据...</p>
        </div>
      </div>
    );
  }

  const currentType = formData.type as FileType;
  const statusConfig = getStatusConfig(fileChange.status);
  const StatusIcon = statusConfig.icon;

  return (
    <ShortcutProvider>
      <div className="space-y-4 sm:space-y-6">
        <BackToPage path={returnPath} shortcut="m">{fromEdit ? '返回文件列表' : '返回首页'}</BackToPage>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <StatusIcon className={`h-6 w-6 sm:h-8 sm:w-8 ${statusConfig.iconColor} flex-shrink-0`} />
                <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 space-x-2 flex items-center">
                  <div>编辑文件</div>
                  {fileChange.status !== 'unchanged' && (
                    <Badge 
                      variant={fileChange.status === 'created' ? 'default' : fileChange.status === 'modified' ? 'secondary' : 'destructive'}
                      className={
                        fileChange.status === 'created' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex-shrink-0' 
                          : fileChange.status === 'modified'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 flex-shrink-0'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 flex-shrink-0'
                      }
                    >
                      {fileChange.status === 'created' ? '新建' : fileChange.status === 'modified' ? '已修改' : '已删除'}
                    </Badge>
                  )}
                </h1>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm sm:text-base truncate">
              {fileChange.filename}
            </p>
          </div>
          <div className="flex gap-2">
            {(fileChange.status === 'created' || fileChange.status === 'modified') && fileChange.canRevert && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDiscardDialog(true)}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                放弃更改
                <ButtonKbd>r</ButtonKbd>
              </Button>
            )}
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => handleDelete(fileChange)}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除文件
              <TransparentButtonKbd>
                z
              </TransparentButtonKbd>
            </Button>
          </div>
        </div>

        {/* File Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">文件信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <p className="font-medium text-sm sm:text-base truncate">
                    {newFileInfo ? newFileInfo.name : fileChange.filename}
                  </p>
                  {newFileInfo && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex-shrink-0 w-fit">
                      新文件
                    </Badge>
                  )}
                </div>
                {newFileInfo && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatFileSize(newFileInfo.size)}
                  </p>
                )}
                {formData.url && (
                  <p className="text-sm text-muted-foreground mt-2">
                    <a
                      href={formData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {formData.url}
                      <ExternalLink className="inline h-3 w-3 ml-1 flex-shrink-0" />
                    </a>
                  </p>
                )}
              </div>
              <div className="flex justify-end sm:justify-start">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFileUpload(true)}
                  className="w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  重新上传
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* File Type Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">文件类型</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleFileTypeSelector
              selectedType={currentType}
              onTypeChange={handleTypeChange}
            />
          </CardContent>
        </Card>

        {/* Metadata Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">元数据信息</CardTitle>
          </CardHeader>
          <CardContent>
            {currentType === "book" && (
              <BookForm
                data={formData.data as BookData}
                highlightedFields={highlightedFields}
                setFormData={setFormData}
                setHighlightedFields={setHighlightedFields}
                updateArrayItem={updateArrayItem}
                removeArrayItem={removeArrayItem}
                addArrayItem={addArrayItem}
              />
            )}
            {currentType === "test" && (
              <TestForm
                data={formData.data as TestData}
                highlightedFields={highlightedFields}
                courseList={courseList}
                setFormData={setFormData}
                setHighlightedFields={setHighlightedFields}
              />
            )}
            {currentType === "doc" && (
              <DocForm
                data={formData.data as DocData}
                highlightedFields={highlightedFields}
                courseList={courseList}
                setFormData={setFormData}
                setHighlightedFields={setHighlightedFields}
              />
            )}
            <div className="flex justify-end w-full mt-4">
              <Button
                onClick={() => handleSave(fileChange)}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-600/90 dark:bg-green-800 dark:hover:bg-green-800/90 text-white w-full sm:w-auto"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                暂存更改
                <TransparentButtonKbd>
                  x
                </TransparentButtonKbd>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* File Upload Dialog */}
        {showFileUpload && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  重新上传文件
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFileUpload(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FileUpload
                  allowedTypes={
                    currentType === "doc" ? ["pdf", "zip"] : ["pdf"]
                  }
                  onUploadSuccess={handleFileUploadSuccess}
                  onUploadError={(error) => {
                    console.error("Upload error:", error);
                  }}
                  disableShortcuts={true}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Discard Changes Dialog */}
        <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>放弃更改</DialogTitle>
              <DialogDescription>
                {fileChange.status === 'created' 
                  ? '确定要放弃所有更改吗？这将删除新创建的文件。此操作无法撤销。'
                  : '确定要放弃所有更改吗？这将恢复到原始状态。此操作无法撤销。'
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDiscardDialog(false)}
                disabled={isLoading}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDiscardChanges(fileChange)}
                disabled={isLoading}
              >
                {isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                放弃更改
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Restore File Dialog */}
        <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>恢复文件</DialogTitle>
              <DialogDescription>
                确定要恢复此文件吗？这将撤销删除操作，文件将重新出现在列表中。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRestoreDialog(false)}
                disabled={isLoading}
              >
                取消
              </Button>
              <Button
                onClick={() => handleRestoreFile(fileChange)}
                disabled={isLoading}
              >
                {isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                恢复文件
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* No Changes Dialog */}
        <Dialog open={showNoChangesDialog} onOpenChange={setShowNoChangesDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>未检测到修改</DialogTitle>
              <DialogDescription>
                文件内容与原始内容相同，无需保存。如果您想修改文件，请先编辑内容后再保存。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => {
                  setShowNoChangesDialog(false);
                  setIsLoading(false);
                }}
              >
                确定
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ShortcutProvider>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import { Button, ButtonKbd } from "@/components/ui/button";
import { useArrayManipulation } from "@/hooks/useArrayManipulation";
import {
  Card,
  CardContent
} from "@/components/ui/card";

import {
  Keyboard,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Step1 } from "./yaml-generator/Step1";
import { Step2 } from "./yaml-generator/Step2";
import { Step3 } from "./yaml-generator/Step3";
import { Step4 } from "./yaml-generator/Step4";
import { PreviewOverlay } from "./yaml-generator/PreviewOverlay";
import { BookForm } from "./yaml-generator/BookForm";
import { TestForm } from "./yaml-generator/TestForm";
import { DocForm } from "./yaml-generator/DocForm";
import { validateURLFileType, validateYear, validateYearRange } from "@/lib/validate";
import { BookData, DocData, FileType, TestData, FormData } from "@/lib/types";
import { generateYaml } from "@/lib/yaml";
import { validateISBN } from "@/lib/isbn";
import { useTheme } from "./theme-provider";
import { createFileChange } from "@/app/file-changes/actions";
import { useAuth } from "@/components/auth-provider";
import { useTopLoader } from "nextjs-toploader";

export default function YamlGenerator() {
  const { actualTheme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const loader = useTopLoader();
  // 课程列表状态
  const [courseList, setCourseList] = useState<string[]>([]);
  // 元数据状态
  const [metadata2Data, setMetadata2Data] = useState<any[]>([]);

  // 初始化 highlight.js 和获取课程数据
  useEffect(() => {
    hljs.registerLanguage("yaml", yaml);
    
    // 获取课程数据
    const fetchCourseData = async () => {
      try {
        const response = await fetch('https://files.byrdocs.org/metadata2.json');
        const data: any = await response.json();
        
        // 保存完整的元数据
        setMetadata2Data(data);
        
        // 提取所有课程名称
        const courses = new Set<string>();
        data.forEach((item: any) => {
          if (item.data?.course) {
            if (Array.isArray(item.data.course)) {
              // 处理数组形式的课程
              item.data.course.forEach((course: any) => {
                if (course.name && course.name.trim()) {
                  courses.add(course.name.trim());
                }
              });
            } else if (item.data.course.name && item.data.course.name.trim()) {
              // 处理单个课程对象
              courses.add(item.data.course.name.trim());
            }
          }
        });
        
        setCourseList(Array.from(courses).sort());
      } catch (error) {
        console.error('Failed to fetch course data:', error);
      }
    };
    
    fetchCourseData();
  }, []);

  const [step, setStep] = useState(1);
  const [fileType, setFileType] = useState<FileType>("book");
  const [urlValidationError, setUrlValidationError] = useState<string>("");
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [highlightedFields, setHighlightedFields] = useState<string[]>([]);
  const [selectedTypeIndex, setSelectedTypeIndex] = useState(0); // 用于键盘选择文件类型
  const [previousStep, setPreviousStep] = useState(1); // 跟踪上一个步骤
  const [showShortcuts, setShowShortcuts] = useState(false); // 快捷键帮助弹窗
  const [inputMethod, setInputMethod] = useState<'url' | 'upload'>('upload'); // 输入方式选择，默认上传文件
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{ name: string; size: number } | null>(null); // 保存上传文件信息
  const [showPreview, setShowPreview] = useState(false); // 预览窗口状态
  const [previewWasOpen, setPreviewWasOpen] = useState(false); // 记录预览窗口之前是否打开
  const [uploadedFile, setUploadedFile] = useState<File | null>(null); // 保存上传的文件对象用于预览
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    id: "",
    url: "",
    type: "book",
    data: {
      title: "",
      authors: [""],
      translators: [],
      edition: "",
      publisher: "",
      publish_year: "",
      isbn: [""],
      filetype: "pdf",
    } as BookData,
  });

  const submitYaml = useCallback(async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setSubmissionSuccess(false);
    try {
      const yamlContent = generateYaml(fileType, formData);
      
      await createFileChange({
        filename: `${formData.id}.yml`,
        md5Hash: formData.id,
        status: 'created',
        content: yamlContent,
      });
      
      // 设置已提交状态和成功状态
      setHasDownloaded(true);
      setSubmissionSuccess(true);
      
      // 不自动隐藏成功提示，让用户手动操作
    } catch (error) {
      console.error('Failed to submit YAML:', error);
      // TODO: Show error message to user
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, fileType, formData]);

  const downloadYaml = () => {
    const yamlContent = generateYaml(fileType, formData);
    const blob = new Blob([yamlContent], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formData.id || "metadata"}.yml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 检查是否应该显示预览按钮
  const shouldShowPreviewButton = () => {
    return (
      step === 3 &&
      inputMethod === 'upload' &&
      formData.data.filetype === 'pdf' &&
      uploadedFile !== null
    );
  };

  const resetFormCompletely = useCallback((type: FileType) => {
    setFileType(type);
    setUrlValidationError(""); // 清除验证错误
    setInputMethod('upload'); // 重置为上传文件方式
    setUploadedFileInfo(null); // 清除上传文件信息
    // 同步键盘选择索引
    const typeIndex = type === "book" ? 0 : type === "test" ? 1 : 2;
    setSelectedTypeIndex(typeIndex);
    let initialData: BookData | TestData | DocData;

    if (type === "book") {
      initialData = {
        title: "",
        authors: [""],
        translators: [],
        edition: "",
        publisher: "",
        publish_year: "",
        isbn: [""],
        filetype: "pdf",
      } as BookData;
    } else if (type === "test") {
      initialData = {
        college: [""],
        course: { type: "", name: "" },
        time: { start: "", end: "", semester: "", stage: "" },
        filetype: "pdf",
        content: [],
      } as TestData;
    } else {
      initialData = {
        title: "",
        filetype: "pdf",
        course: [{ type: "", name: "" }],
        content: [],
      } as DocData;
    }

    // 完全重置所有数据，包括URL和ID
    setFormData({
      id: "",
      url: "",
      type,
      data: initialData,
    });
  }, []);

  const createNewMetadata = useCallback(() => {
    // 重置所有状态
    setStep(1);
    setUrlValidationError("");
    setSubmissionSuccess(false);
    resetFormCompletely("book");
  }, [resetFormCompletely]);

  // Array manipulation helpers
  const { updateArrayItem, removeArrayItem, addArrayItem } = useArrayManipulation(setFormData);

  const resetForm = useCallback((type: FileType) => {
    setFileType(type);
    setUrlValidationError(""); // 清除验证错误
    
    // 同步键盘选择索引
    const typeIndex = type === "book" ? 0 : type === "test" ? 1 : 2;
    setSelectedTypeIndex(typeIndex);
    let initialData: BookData | TestData | DocData;

    if (type === "book") {
      initialData = {
        title: "",
        authors: [""],
        translators: [],
        edition: "",
        publisher: "",
        publish_year: "",
        isbn: [""],
        filetype: "pdf",
      } as BookData;
    } else if (type === "test") {
      initialData = {
        college: [""],
        course: { type: "", name: "" },
        time: { start: "", end: "", semester: "", stage: "" },
        filetype: "pdf",
        content: [],
      } as TestData;
    } else {
      initialData = {
        title: "",
        filetype: "pdf",
        course: [{ type: "", name: "" }],
        content: [],
      } as DocData;
    }

    // 保持URL和ID不变，只重置data部分
    setFormData((prev) => ({
      ...prev,
      type,
      data: initialData,
    }));
  }, []);

  // 检查重复ID
  const checkForDuplicateId = useCallback((id: string): boolean => {
    return metadata2Data.some((item: any) => item.id === id);
  }, [metadata2Data]);

  // 验证步骤2
  const validateStep2 = useCallback((): boolean => {
    if (!formData.id || !formData.url) {
      return false;
    }
    
    // 检查URL格式是否有效
    const validation = validateURLFileType(formData.url, fileType);
    return validation.isValid;
  }, [formData, fileType]);

  // 验证步骤3
  const validateStep3 = useCallback((): boolean => {
    if (fileType === "book") {
      const data = formData.data as BookData;
      const hasValidISBN = data.isbn.some(
        (isbn) => isbn.trim() && validateISBN(isbn)
      );
      
      // 验证出版年份
      const isValidYear = !data.publish_year || validateYear(data.publish_year);
      
      return !!(
        data.title &&
        data.authors.some((a) => a.trim()) &&
        hasValidISBN &&
        isValidYear
      );
    } else if (fileType === "test") {
      const data = formData.data as TestData;
      
      // 验证年份范围（年份不是必填的）
      const yearValidation = validateYearRange(data.time.start, data.time.end);
      
      return !!(
        data.course.name &&
        data.content.length > 0 &&
        yearValidation.isValid
      );
    } else if (fileType === "doc") {
      const data = formData.data as DocData;
      return !!(
        data.title &&
        data.course.every((c) => c.name.trim()) &&
        data.content.length > 0
      );
    }
    return false;
  }, [fileType, formData.data]);

  // 获取需要高亮的字段ID
  const getHighlightedFieldIds = useCallback((): string[] => {
    const fieldIds: string[] = [];
    
    if (fileType === "book") {
      const data = formData.data as BookData;
      
      if (!data.title) {
        fieldIds.push("book-title");
      }
      
      if (!data.authors.some((a) => a.trim())) {
        fieldIds.push("book-authors");
      }
      
      const hasValidISBN = data.isbn.some(
        (isbn) => isbn.trim() && validateISBN(isbn)
      );
      if (!hasValidISBN) {
        fieldIds.push("book-isbn");
      }
      
      if (data.publish_year && !validateYear(data.publish_year)) {
        fieldIds.push("book-publish-year");
      }
    } else if (fileType === "test") {
      const data = formData.data as TestData;
      
      if (!data.course.name) {
        fieldIds.push("test-course-name");
      }
      
      if (data.content.length === 0) {
        fieldIds.push("test-content");
      }
      
      const yearValidation = validateYearRange(data.time.start, data.time.end);
      if (!yearValidation.isValid) {
        fieldIds.push("test-time-range");
      }
    } else if (fileType === "doc") {
      const data = formData.data as DocData;
      
      if (!data.title) {
        fieldIds.push("doc-title");
      }
      
      if (!data.course.every((c) => c.name.trim())) {
        fieldIds.push("doc-course");
      }
      
      if (data.content.length === 0) {
        fieldIds.push("doc-content");
      }
    }
    
    return fieldIds;
  }, [fileType, formData.data]);

  // 键盘快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检测操作系统并使用相应的修饰键
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // 全局页面切换快捷键 (Cmd/Ctrl + 左/右箭头，第三页使用 Cmd/Ctrl + >)
      if (cmdOrCtrl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        
        if (e.key === 'ArrowLeft' && step > 1) {
          // 向前翻页（不触发自动focus）
          const newStep = step - 1;
          setPreviousStep(step); // 设置为当前步骤，这样不会触发自动focus
          setStep(newStep);
        } else if ((e.key === 'ArrowRight' && step <= 3)) {
          // 向后翻页，需要验证当前页面
          if (step === 1) {
            // 使用当前选中的类型
            const fileTypes: FileType[] = ['book', 'test', 'doc'];
            resetForm(fileTypes[selectedTypeIndex]);
            setStep(2);
          } else if (step === 2 && validateStep2()) {
            const currentId = formData.id;
            if (currentId && checkForDuplicateId(currentId)) {
              // Redirect to edit page if duplicate ID found
              loader.start();
              router.push(`/edit/${currentId}`);
              return;
            }
            setStep(3);
          } else if (step === 3 && validateStep3()) {
            setHighlightedFields([]);
            setStep(4);
          } else if (step === 3) {
            // 第三页验证失败时，高亮未填项并focus第一个
            const highlightIds = getHighlightedFieldIds();
            setHighlightedFields(highlightIds);
            if (highlightIds.length > 0) {
              setTimeout(() => {
                const firstHighlightedElement = document.getElementById(highlightIds[0]);
                if (firstHighlightedElement) {
                  firstHighlightedElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                  });
                  // 如果是输入框，则focus它
                  if (firstHighlightedElement instanceof HTMLInputElement || 
                      firstHighlightedElement instanceof HTMLTextAreaElement) {
                    firstHighlightedElement.focus();
                  } else {
                    // 如果是其他元素，尝试找到其中的输入框
                    const inputElement = firstHighlightedElement.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
                    if (inputElement) {
                      inputElement.focus();
                    }
                  }
                }
              }, 100);
            }
          }
        }
        return;
      }


      // 检查是否在特殊组件中（下拉框、弹窗等），如果是则不处理全局快捷键
      const isInSpecialComponent = (
        e.target instanceof HTMLButtonElement ||
        (e.target as Element)?.closest('[role="combobox"]') ||
        (e.target as Element)?.closest('[role="listbox"]') ||
        (e.target as Element)?.closest('[role="option"]') ||
        (e.target as Element)?.closest('[data-radix-popper-content-wrapper]') ||
        (e.target as Element)?.closest('[cmdk-root]') ||
        (e.target as Element)?.closest('.popover-content')
      );

      // 如果用户正在输入框中输入，处理特定的快捷键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // 第二页：URL输入框回车进入下一步
        if (step === 2 && e.key === 'Enter') {
          e.preventDefault();
          if (validateStep2()) {
            const currentId = formData.id;
            if (currentId && checkForDuplicateId(currentId)) {
              // Redirect to edit page if duplicate ID found
              loader.start();
              router.push(`/edit/${currentId}`);
              return;
            }
            setStep(3);
          }
          return;
        }

        
        // 对于输入框，只阻止 Enter 键，其他全局快捷键仍然有效
        if (e.key === 'Enter') {
          return;
        }
      }

      // 第一页：方向键选择文件类型
      if (step === 1) {
        const fileTypes: FileType[] = ['book', 'test', 'doc'];
        
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedTypeIndex(prev => prev > 0 ? prev - 1 : fileTypes.length - 1);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedTypeIndex(prev => prev < fileTypes.length - 1 ? prev + 1 : 0);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          resetForm(fileTypes[selectedTypeIndex]);
          setStep(2);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, selectedTypeIndex, validateStep2, validateStep3, getHighlightedFieldIds, resetForm, setHighlightedFields, setStep, submitYaml, createNewMetadata, hasDownloaded, submissionSuccess, router, loader, checkForDuplicateId, formData.id]);

  useEffect(() => {
    if (previousStep === 3 && step !== 3) {
      setPreviewWasOpen(showPreview);
      setShowPreview(false);
    } else if (step === 3 && previousStep !== 3 && previewWasOpen) {
      setShowPreview(true);
    }
    if (step > previousStep) {
      setTimeout(() => {
        let elementToFocus: HTMLElement | null = null;
        
        if (step === 2) {
          return;
        } else if (step === 3) {
          if (fileType === 'book') {
            elementToFocus = document.getElementById('title');
            if (elementToFocus && elementToFocus instanceof HTMLInputElement && (formData.data as BookData).title?.trim()) {
              elementToFocus = null;
            }
          } else if (fileType === 'test') {
            const collegeMultiSelect = document.querySelector('[data-testid="college-multiselect"] [role="combobox"]') as HTMLElement;
            if (collegeMultiSelect && (formData.data as TestData).college && (formData.data as TestData).college!.length > 0) {
              elementToFocus = null;
            } else {
              elementToFocus = collegeMultiSelect;
            }
          } else if (fileType === 'doc') {
            elementToFocus = document.getElementById('doc-title');
            if (elementToFocus && elementToFocus instanceof HTMLInputElement && (formData.data as DocData).title?.trim()) {
              elementToFocus = null;
            }
          }
        }
        
        if (elementToFocus) {
          elementToFocus.focus();
        }
      }, 100);
    }
    
    setPreviousStep(step);
  }, [step, previousStep, fileType, formData.url, formData.data, showPreview, previewWasOpen]);

  useEffect(() => {
    if (showPreview) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showPreview]);

  useEffect(() => {
    if (uploadedFile) {
      const newBlobUrl = URL.createObjectURL(uploadedFile);
      setBlobUrl(newBlobUrl);
      return () => {
        URL.revokeObjectURL(newBlobUrl);
      };
    } else {
      setBlobUrl('');
    }
  }, [uploadedFile]);

  return (
      <div className="p-4 pt-0">
      <div className="max-w-4xl mx-auto">
        <div className="text-center my-8 mt-2">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            添加新文件
          </h1>
          <p className="text-muted-foreground">
            上传文件和编写
            <a
              href="https://github.com/byrdocs/byrdocs-archive/wiki/%E5%85%B3%E4%BA%8E%E6%96%87%E4%BB%B6"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300  hover:underline"
              
            >
              元信息
            </a>
          </p>
        </div>

        <div className="mb-8">
          <div className="flex justify-center">
            <div className="flex items-center">
              {[1, 2, 3, 4].map((stepNum) => (
                <div key={stepNum} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step >= stepNum
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stepNum}
                  </div>
                  {stepNum < 4 && (
                    <div
                      className={`w-10 sm:w-20 h-0.5 ${
                        step > stepNum ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center mt-2">
            <div className="flex text-xs sm:text-sm space-x-6 sm:space-x-[56px] text-muted-foreground">
              <span>选择类型</span>
              <span>基本信息</span>
              <span>详细信息</span>
              <span>预览提交</span>
            </div>
          </div>
        </div>

        <Card className="bg-card shadow-lg relative">
          {/* 预览按钮 */}
          {shouldShowPreviewButton() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(true)}
              className="absolute right-16 top-4 z-10 hidden lg:flex"
              title="预览文件"
            >
              <Eye className="w-4 h-4" />
              <ButtonKbd>l</ButtonKbd>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowShortcuts(true)}
            className="absolute right-4 top-4 z-10 hidden sm:flex"
            title="快捷键帮助"
          >
            <Keyboard className="w-4 h-4" />
            <ButtonKbd className="sm:hidden">?</ButtonKbd>
          </Button>
          <CardContent className="p-8">
            {step === 1 && (
              <Step1
                selectedTypeIndex={selectedTypeIndex}
                setSelectedTypeIndex={setSelectedTypeIndex}
                resetForm={resetForm}
                setStep={setStep}
              />
            )}
            {step === 2 && (
              <Step2
                fileType={fileType}
                inputMethod={inputMethod}
                setInputMethod={setInputMethod}
                formData={formData}
                setFormData={setFormData}
                uploadedFileInfo={uploadedFileInfo}
                setUploadedFileInfo={setUploadedFileInfo}
                urlValidationError={urlValidationError}
                setUrlValidationError={setUrlValidationError}
                setUploadedFile={setUploadedFile}
                validateStep2={validateStep2}
                setStep={setStep}
                setPreviousStep={setPreviousStep}
                step={step}
                metadata2Data={metadata2Data}
              />
            )}
            {(step === 3 && !showPreview) && (
              <Step3
                fileType={fileType}
                formData={formData}
                courseList={courseList}
                highlightedFields={highlightedFields}
                setFormData={setFormData}
                setHighlightedFields={setHighlightedFields}
                updateArrayItem={updateArrayItem}
                removeArrayItem={removeArrayItem}
                addArrayItem={addArrayItem}
                validateStep3={validateStep3}
                getHighlightedFieldIds={getHighlightedFieldIds}
                setStep={setStep}
                setPreviousStep={setPreviousStep}
                setHasDownloaded={setHasDownloaded}
                step={step}
              />
            )}
            {step === 4 && (
              <Step4
                fileType={fileType}
                formData={formData}
                actualTheme={actualTheme}
                hasDownloaded={hasDownloaded}
                isSubmitting={isSubmitting}
                submissionSuccess={submissionSuccess}
                user={user}
                submitYaml={submitYaml}
                downloadYaml={downloadYaml}
                createNewMetadata={createNewMetadata}
                setStep={setStep}
                setPreviousStep={setPreviousStep}
                step={step}
              />
            )}
          </CardContent>
        </Card>
      </div>
      
      <PreviewOverlay
        showPreview={showPreview}
        uploadedFile={uploadedFile}
        blobUrl={blobUrl}
        fileType={fileType}
        setShowPreview={setShowPreview}
        setPreviousStep={setPreviousStep}
        setStep={setStep}
        step={step}
        validateStep3={validateStep3}
        setHighlightedFields={setHighlightedFields}
        setHasDownloaded={setHasDownloaded}
        getHighlightedFieldIds={getHighlightedFieldIds}
      >
        {fileType === "book" && (
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
        {fileType === "test" && (
          <TestForm
            data={formData.data as TestData}
            highlightedFields={highlightedFields}
            courseList={courseList}
            setFormData={setFormData}
            setHighlightedFields={setHighlightedFields}
          />
        )}
        {fileType === "doc" && (
          <DocForm
            data={formData.data as DocData}
            highlightedFields={highlightedFields}
            courseList={courseList}
            setFormData={setFormData}
            setHighlightedFields={setHighlightedFields}
          />
        )}
      </PreviewOverlay>
      
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              快捷键说明
            </DialogTitle>
            <DialogDescription>
              当前可用的快捷键操作
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">全局快捷键</h3>
              <div className="grid gap-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">向前翻页</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 text-xs bg-background border rounded">Cmd/Ctrl</kbd>
                    <span className="text-xs">+</span>
                    <kbd className="px-2 py-1 text-xs bg-background border rounded">←</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">向后翻页</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 text-xs bg-background border rounded">Cmd/Ctrl</kbd>
                    <span className="text-xs">+</span>
                    <kbd className="px-2 py-1 text-xs bg-background border rounded">→</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">向下翻页</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 text-xs bg-background border rounded">j</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">向上翻页</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 text-xs bg-background border rounded">k</kbd>
                  </div>
                </div>
              </div>
            </div>

            {(step === 1 || step == 2) && 
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">当前页面快捷键</h3>
              <div className="grid gap-3">
                {step === 1 && (
                  <>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">选择文件类型</span>
                      <div className="flex items-center gap-1">
                        <kbd className="px-2 py-1 text-xs bg-background border rounded">↑</kbd>
                        <kbd className="px-2 py-1 text-xs bg-background border rounded">↓</kbd>
                        <kbd className="px-2 py-1 text-xs bg-background border rounded">←</kbd>
                        <kbd className="px-2 py-1 text-xs bg-background border rounded">→</kbd>
                      </div>
                    </div>
                  </>
                )}
                
                {step === 2 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">填写完 URL 后进入下一步</span>
                    <kbd className="px-2 py-1 text-xs bg-background border rounded">Enter</kbd>
                  </div>
                )}
              </div>
            </div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

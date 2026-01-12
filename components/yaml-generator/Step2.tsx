import { Button, ButtonKbd } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label, LabelKbd } from "@/components/ui/label";
import {
  Upload as UploadIcon,
  FileText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FileType } from "@/lib/types";
import { extractMD5FromURL, extractFileTypeFromURL, extractFileNameFromURL, validateURLFileType } from "@/lib/validate";
import FileUpload from "@/components/file-upload";
import { useTopLoader } from "nextjs-toploader";

interface Step2Props {
  fileType: FileType;
  inputMethod: 'url' | 'upload';
  setInputMethod: (method: 'url' | 'upload') => void;
  formData: any;
  setFormData: (data: any) => void;
  uploadedFileInfo: { name: string; size: number } | null;
  setUploadedFileInfo: (info: { name: string; size: number } | null) => void;
  urlValidationError: string;
  setUrlValidationError: (error: string) => void;
  setUploadedFile: (file: File | null) => void;
  validateStep2: () => boolean;
  setStep: (step: number) => void;
  setPreviousStep: (step: number) => void;
  step: number;
  metadata2Data: any[];
}

export function Step2({
  fileType,
  inputMethod,
  setInputMethod,
  formData,
  setFormData,
  uploadedFileInfo,
  setUploadedFileInfo,
  urlValidationError,
  setUrlValidationError,
  setUploadedFile,
  validateStep2,
  setStep,
  setPreviousStep,
  step,
  metadata2Data,
}: Step2Props) {
  const router = useRouter();
  const loader = useTopLoader();

  const checkForDuplicateId = (id: string): boolean => {
    return metadata2Data.some((item: any) => item.id === id);
  };

  const handleNextStep = () => {
    if (!validateStep2()) return;
    
    const currentId = formData.id;
    if (currentId && checkForDuplicateId(currentId)) {
      // Redirect to edit page if duplicate ID found
      loader.start();
      router.push(`/edit/${currentId}`);
      return;
    }
    
    // Proceed to step 3 if no duplicate
    setStep(3);
  };
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">上传文件</h2>
        <p className="text-muted-foreground">上传文件或粘贴文件链接</p>
        <Badge variant="outline">
          {fileType === "book" ? "书籍" : fileType === "test" ? "试题" : "资料"}
        </Badge>
      </div>

      {/* 输入方式选择 */}
      <div className="space-y-4">
        <Label>选择输入方式</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              inputMethod === 'upload' ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setInputMethod('upload')}
          >
            <CardHeader className="text-center pb-3 relative">
              <UploadIcon className="w-8 h-8 mx-auto text-green-500 dark:text-green-400" />
              <CardTitle className="text-base">
                上传文件
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 absolute top-2 right-3 pointer-events-none"
                  onClick={() => {
                    setFormData((prev: any) => ({
                      ...prev,
                      url: "",
                      id: "",
                    }))
                    setUploadedFileInfo(null)
                    setInputMethod('upload')
                  }}
                >
                  <ButtonKbd>1</ButtonKbd>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-sm text-center">
                本地文件，需要上传
              </CardDescription>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              inputMethod === 'url' ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setInputMethod('url')}
          >
            <CardHeader className="text-center pb-3 relative">
              <FileText className="w-8 h-8 mx-auto text-blue-500 dark:text-blue-400" />
              <CardTitle className="text-base">
                粘贴链接
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 absolute top-2 right-3 pointer-events-none"
                  onClick={() => setInputMethod('url')}
                >
                  <ButtonKbd>2</ButtonKbd>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-sm text-center">
                已有文件URL，直接粘贴
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 根据选择的方式显示不同的输入组件 */}
      {inputMethod === 'upload' ? (
        <div className="space-y-2">
          <FileUpload
            allowedTypes={fileType === "book" ? ["pdf"] : fileType === "test" ? ["pdf"] : ["pdf", "zip"]}
            onUploadSuccess={(key: string, fileInfo?: { name: string; size: number }) => {
              // 构建完整的URL
              const fullUrl = `${process.env.NEXT_PUBLIC_SITE_BASE_URL}/files/${key}`;
              const md5 = extractMD5FromURL(fullUrl);
              const detectedFileType = extractFileTypeFromURL(fullUrl, fileType);
              
              // 保存文件信息
              if (fileInfo) {
                setUploadedFileInfo(fileInfo);
              }
              
              setFormData((prev: any) => ({
                ...prev,
                url: fullUrl,
                id: md5,
                data: {
                  ...prev.data,
                  filetype: detectedFileType,
                },
              }));
              
              setUrlValidationError("");
            }}
            onUploadError={(error) => {
              setUrlValidationError(`上传失败: ${error}`);
            }}
            onSwitchToUrl={(url: string) => {
              setInputMethod('url');
              const md5 = extractMD5FromURL(url);
              const detectedFileType = extractFileTypeFromURL(url, fileType);
              
              setFormData((prev: any) => ({
                type: prev.type,
                url: url,
                id: md5,
                data: {
                  ...prev.data,
                  filetype: detectedFileType,
                },
              }));
              
              setUrlValidationError("");
            }}
            initialUploadedKey={formData.url ? extractFileNameFromURL(formData.url) : undefined}
            initialFileInfo={uploadedFileInfo}
            onReset={() => {
              setFormData((prev: any) => ({
                ...prev,
                url: "",
                id: "",
                data: {
                  ...prev.data,
                  filetype: "pdf",
                },
              }));
              setUploadedFileInfo(null);
            }}
            onFileSelected={(file) => {
              setUploadedFile(file);
            }}
            className="max-w-none"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="url">
            文件 URL *
            <LabelKbd>u</LabelKbd>
          </Label>
          <div className="relative">
            <Input
              id="url"
              className="text-sm w-full pr-10"
              placeholder={`${process.env.NEXT_PUBLIC_SITE_BASE_URL}/files/...`}
              value={formData.url}
              onChange={(e) => {
                const url = e.target.value;
                const md5 = extractMD5FromURL(url);
                
                // 验证文件格式
                const validation = validateURLFileType(url, fileType);
                if (!validation.isValid && validation.error) {
                  setUrlValidationError(validation.error);
                } else {
                  setUrlValidationError("");
                }
                
                // 只有当URL不为空时才提取文件类型，否则使用默认的pdf
                const detectedFileType = url.trim() ? extractFileTypeFromURL(url, fileType) : "pdf";
                setFormData((prev: any) => ({
                  ...prev,
                  url: url,
                  id: md5,
                  data: {
                    ...prev.data,
                    filetype: detectedFileType,
                  },
                }));
              }}
            />
            <kbd className="absolute right-2 top-1/2 transform -translate-y-1/2 px-2 py-1 text-xs bg-muted text-muted-foreground border rounded">⏎</kbd>
          </div>
          <p className="text-xs text-muted-foreground">
            已上传文件的 URL
          </p>
          {urlValidationError && (
            <p className="text-xs text-red-500">{urlValidationError}</p>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => {
          setPreviousStep(step); // 防止触发自动focus
          setStep(1);
        }}>
          上一步
          <ButtonKbd>z</ButtonKbd>
        </Button>
        <Button onClick={handleNextStep} disabled={!validateStep2()}>
          下一步：填写详细信息
          <ButtonKbd invert={true}>x</ButtonKbd>
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button, ButtonKbd } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Upload as UploadIcon,
  FileText,
  Trash2,
  ExternalLink,
  AlertCircle,
  User,
  Loader2,
} from "lucide-react";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import CryptoJS from "crypto-js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { GithubIcon } from "./icon/github";

interface FileUploadProps {
  allowedTypes: string[];
  onUploadSuccess: (key: string, fileInfo?: { name: string; size: number }) => void;
  onUploadError?: (error: string) => void;
  className?: string;
  initialUploadedKey?: string; // 初始已上传的文件key
  initialFileInfo?: { name: string; size: number } | null; // 初始文件信息
  onReset?: () => void; // 重置回调
  onSwitchToUrl?: (url: string) => void; // 切换到粘贴链接模式的回调
  onFileSelected?: (file: File | null) => void; // 文件选择回调
  disableShortcuts?: boolean; // 禁用快捷键
}

interface R2UploadResponse {
  success: boolean;
  code?: string;
  key?: string;
  uploadId?: string;
  etag?: string;
  error?: string;
}

interface EtagArray {
  partNumber: number,
  etag: string,
}[]

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export default function FileUpload({ 
  allowedTypes, 
  onUploadSuccess, 
  onUploadError,
  className,
  initialUploadedKey,
  initialFileInfo,
  onReset,
  onSwitchToUrl,
  onFileSelected,
  disableShortcuts = false
}: FileUploadProps) {
  const { token, isLoading } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [md5Progress, setMd5Progress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'calculating' | 'calculated' | 'preparing' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [md5Hash, setMd5Hash] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [highlightTypes, setHighlightTypes] = useState(false);
  const [uploadedKey, setUploadedKey] = useState<string>(''); // 保存上传成功的key
  const [fileExistsError, setFileExistsError] = useState<{ md5: string; extension: string } | null>(null); // 文件已存在错误信息
  const [uploadSession, setUploadSession] = useState<{ key: string; uploadId: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);



  // Handle initial uploaded key
  useEffect(() => {
    if (initialUploadedKey && initialUploadedKey !== uploadedKey) {
      setUploadedKey(initialUploadedKey);
      setUploadStatus('success');
      setUploadProgress(100);
      // 从key中提取文件信息用于显示
      const keyParts = initialUploadedKey.split('.');
      if (keyParts.length >= 2) {
        const extension = keyParts[keyParts.length - 1];
        const md5 = keyParts.slice(0, -1).join('.');
        setMd5Hash(md5);
        if (!initialFileInfo?.name || !initialFileInfo?.size) {
          return;
        }
        const fileName = initialFileInfo?.name;
        const fileSize = initialFileInfo?.size;
        const virtualFile = new File([], fileName, { type: `application/${extension}` });
        Object.defineProperty(virtualFile, 'size', { value: fileSize, writable: false });
        setSelectedFile(virtualFile);
      }
    }
  }, [initialUploadedKey, uploadedKey, initialFileInfo]);

  // Calculate MD5 hash in chunks
  const calculateMD5 = useCallback(async (file: File, signal?: AbortSignal): Promise<string> => {
    return new Promise((resolve, reject) => {
      const hash = CryptoJS.algo.MD5.create();
      let currentChunk = 0;
      const chunks = Math.ceil(file.size / CHUNK_SIZE);

      const processChunk = async () => {
        // Check if operation was aborted
        if (signal?.aborted) {
          reject(new DOMException('MD5 calculation was aborted', 'AbortError'));
          return;
        }

        if (currentChunk >= chunks) {
          const md5 = hash.finalize().toString();
          resolve(md5);
          return;
        }

        const start = currentChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        try {
          const arrayBuffer = await chunk.arrayBuffer();
          const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
          hash.update(wordArray);
          currentChunk++;
          
          setMd5Progress((currentChunk / chunks) * 100); // MD5 calculation progress
          
          // Use setTimeout to avoid blocking the UI
          setTimeout(processChunk, 0);
        } catch (error) {
          reject(error);
        }
      };

      // Listen for abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          reject(new DOMException('MD5 calculation was aborted', 'AbortError'));
        });
      }

      processChunk();
    });
  }, []);

  // Start an R2 mpu session
  const startR2Upload = async (key: string, signal?: AbortSignal): Promise<R2UploadResponse> => {
    if (!token) {
      throw new Error('No authentication token found');
    }
    const response = await fetch(`${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/api/r2/mpu-start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  };

  // Upload one part for R2
  const uploadR2Part = async (
    key: string,
    uploadId: string,
    partNumber: number,
    chunk: File,
    signal?: AbortSignal,
  ): Promise<R2UploadResponse> => {
    if (!token) {
      throw new Error('No authentication token found');
    }
    const formData = new FormData();
    formData.append('key', key);
    formData.append('uploadId', uploadId);
    formData.append('partNumber', partNumber.toString());
    formData.append('file', chunk);
    const response = await fetch(`${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/api/r2/mpu-uploadpart`,{
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  // Upload all parts to R2
  const uploadToR2 = async (
    key: string,
    uploadId: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<EtagArray> => {
    const partNumber = Math.ceil(file.size / CHUNK_SIZE);
    const etagArray: EtagArray = [];

    for (let part = 0; part < partNumber; part++) {
      const start = part * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const response = await uploadR2Part(key, uploadId, part + 1, chunk);
      if (!response.success || !response.etag) {
        throw new Error(response.error || '上传分片失败');
      }
      etagArray.push({ partNumber: part + 1, etag: response.etag });

      // Update upload progress
      setUploadProgress(((part + 1) / partNumber) * 100);
    }
    return etagArray;
  }

  // Finish R2 mpu session
  const finishR2Upload = async (
    key: string,
    uploadId: string,
    parts: EtagArray,
    signal?: AbortSignal,
  ): Promise<R2UploadResponse> => {
    if (!token) {
      throw new Error('No authentication token found');
    }
    const response = await fetch(`${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/api/r2/mpu-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key, uploadId, parts }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  // Abort R2 mpu session
  const abortR2Upload = async (
    key: string,
    uploadId: string,
  ): Promise<R2UploadResponse> => {
    if (!token) {
      throw new Error('No authentication token found');
    }
    const response = await fetch(`${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/api/r2/mpu-abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key, uploadId }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  const validateAndSetFile = async (file: File) => {
    // Check file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      setErrorMessage(`只支持 ${allowedTypes.join(', ')} 格式的文件`);
      setUploadStatus('error');
      setHighlightTypes(true);
      setTimeout(() => setHighlightTypes(false), 3000);
      return false;
    }

    setSelectedFile(file);
    onFileSelected?.(file);
    setUploadStatus('calculating');
    setMd5Progress(0);
    setUploadProgress(0);
    setErrorMessage('');
    setMd5Hash('');
    setFileExistsError(null);
    
    // Create new abort controller for MD5 calculation
    abortControllerRef.current = new AbortController();
    
    // Start calculating MD5 immediately
    try {
      const md5 = await calculateMD5(file, abortControllerRef.current.signal);
      setMd5Hash(md5);
      setUploadStatus('calculated');
      setMd5Progress(100);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setUploadStatus('idle');
        setMd5Progress(0);
        setUploadProgress(0);
        setSelectedFile(null);
        onFileSelected?.(null);
        return false;
      }
      setErrorMessage('计算文件哈希值失败');
      setUploadStatus('error');
    }
    
    return true;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    validateAndSetFile(file);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !md5Hash) return;

    setUploadStatus('preparing');
    setUploadProgress(0);
    setErrorMessage('');
    
    abortControllerRef.current = new AbortController();

    try {
      // Get file extension
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
      const key = `${md5Hash}.${fileExtension}`;

      // Start R2 upload session
      const r2StartResponse = await startR2Upload(key);
      if (!r2StartResponse.success || !r2StartResponse.uploadId) {
        if (r2StartResponse.code === 'FILE_EXISTS') {
          setFileExistsError({ md5: md5Hash, extension: fileExtension || 'pdf' });
          setUploadStatus('error');
          return;
        }
        throw new Error(r2StartResponse.error || '未能开始上传');
      }
      setUploadStatus('uploading');
      setUploadSession({ key, uploadId: r2StartResponse.uploadId });

      // Start uploading parts
      const etags = await uploadToR2(key, r2StartResponse.uploadId, selectedFile);
      
      // Finish R2 upload session
      const r2CompleteResponse = await finishR2Upload(key, r2StartResponse.uploadId, etags);
      if (!r2CompleteResponse.success) {
        throw new Error(r2CompleteResponse.error || '未能完成上传');
      }
      setUploadStatus('success');
      setUploadedKey(key);
      setUploadSession(null);
      onUploadSuccess(key, selectedFile ? { name: selectedFile.name, size: selectedFile.size } : undefined);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setErrorMessage('上传已取消');
        setUploadStatus('error');
        return;
      }
      console.error('Upload failed:', error);
      setErrorMessage(error instanceof Error ? error.message : '上传失败');
      setUploadStatus('error');
      onUploadError?.(error instanceof Error ? error.message : '上传失败');
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      if (uploadSession){
        abortR2Upload(uploadSession.key, uploadSession.uploadId)
      }
      abortControllerRef.current.abort();
    }
    setUploadSession(null);
  };

  const handleRemoveFile = () => {
    if (abortControllerRef.current) {
      if (uploadSession){
        abortR2Upload(uploadSession.key, uploadSession.uploadId)
      }
      abortControllerRef.current.abort();
    }

    setSelectedFile(null);
    onFileSelected?.(null);
    setUploadStatus('idle');
    setMd5Progress(0);
    setUploadProgress(0);
    setErrorMessage('');
    setMd5Hash('');
    setUploadedKey('');
    setUploadSession(null);
    setFileExistsError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    onReset?.();
  };

  const handleUseExistingFile = () => {
    if (fileExistsError && onSwitchToUrl) {
      const url = `${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/files/${fileExistsError.md5}.${fileExistsError.extension}`;
      
      setSelectedFile(null);
      onFileSelected?.(null);
      onReset?.();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      onSwitchToUrl(url);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = () => {
    switch (uploadStatus) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-destructive';
      case 'uploading':
      case 'calculating':
      case 'preparing':
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusText = () => {
    switch (uploadStatus) {
      case 'calculating':
        return '正在计算文件哈希值...';
      case 'calculated':
        return '准备上传';
      case 'preparing':
        return '正在获取上传凭证...';
      case 'uploading':
        return '正在上传...';
      case 'success':
        return '上传成功';
      case 'error':
        return '上传失败';
      default:
        return '准备上传';
    }
  };

  const handleLogin = () => {
    window.open('/login?close=true', '_blank');
  };


  if (!token) {
    return (
      <Card className={cn("w-full max-w-md mx-auto", className)}>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <GithubIcon className="w-6 h-6 text-primary" />
            )}
          </div>
          <CardTitle>登录以上传文件</CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleLogin} 
            className="w-full"
            size="lg"
            disabled={isLoading}
          >
            使用 GitHub 登录
            <ExternalLink className="w-4 h-4 mr-2" />
            {!disableShortcuts && <ButtonKbd invert={true}>l</ButtonKbd>}
          </Button>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card className={cn("w-full max-w-md mx-auto", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <UploadIcon className="w-5 h-5" />
          上传文件
        </CardTitle>
        <CardDescription>
          
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedFile === null? (
          <div className="space-y-4">
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragOver 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <FileText className={`w-8 h-8 mx-auto mb-2 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className={`text-sm mb-1 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`}>
                {isDragOver ? '释放文件以上传' : '拖动文件到此处或点击选择'} 
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 ml-1 pointer-events-none"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {!disableShortcuts && <ButtonKbd>u</ButtonKbd>}
                </Button>
              </p>
              <p className={`text-xs transition-colors ${
                highlightTypes 
                  ? 'text-red-600 font-medium' 
                  : 'text-muted-foreground'
              }`}>
                支持的文件类型: {allowedTypes.join(', ')}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={allowedTypes.map(type => `.${type}`).join(',')}
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveFile}
                disabled={uploadStatus === 'calculating' || uploadStatus === 'preparing' || uploadStatus === 'uploading'}
              >
                <Trash2 className="w-4 h-4" />
                {!disableShortcuts && <ButtonKbd>d</ButtonKbd>}
              </Button>
            </div>

            {uploadStatus === 'calculating' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={getStatusColor()}>正在计算文件哈希值...</span>
                  <span className="text-muted-foreground">
                    {Math.round(md5Progress)}%
                  </span>
                </div>
                <Progress value={md5Progress} className="h-2" />
              </div>
            )}

            {uploadStatus === 'preparing' && (
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <span className={getStatusColor()}>{getStatusText()}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                </div>
              </div>
            )}

            {(uploadStatus === 'uploading' || uploadStatus === 'success') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={getStatusColor()}>
                    {uploadedKey ? (
                      <span className="ml-1 text-green-600 font-mono break-all">
                        <a 
                          href={`${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/files/${uploadedKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {getStatusText()}
                          <ExternalLink size={12} className="inline-block ml-1" />
                        </a>
                      </span>
                    ) : getStatusText()}
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {uploadStatus === 'error' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm text-red-600">
                  {fileExistsError ? (
                    <div className="space-y-2">
                      <div>文件已存在</div>
                      <Button 
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        onClick={handleUseExistingFile}
                      >
                        使用该文件
                        {!disableShortcuts && <ButtonKbd>r</ButtonKbd>}
                      </Button>
                    </div>
                  ) : (
                    errorMessage
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {uploadStatus === 'calculated' || uploadStatus === 'error' ? (
                <Button 
                  onClick={handleUpload} 
                  className="flex-1"
                  disabled={!selectedFile || !md5Hash}
                >
                  <UploadIcon className="w-4 h-4 mr-1" />
                  上传
                  {!disableShortcuts && <ButtonKbd invert={true}>f</ButtonKbd>}
                </Button>
              ) : uploadStatus === 'calculating' ? (
                <>
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={handleCancel}
                  >
                    取消
                    {!disableShortcuts && <ButtonKbd>c</ButtonKbd>}
                  </Button>
                </>
              ) : uploadStatus === 'preparing' || uploadStatus === 'uploading' ? (
                <>
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={handleCancel}
                  >
                    取消
                    {!disableShortcuts && <ButtonKbd>c</ButtonKbd>}
                  </Button>
                </>
              ) : uploadStatus === 'success' ? (
                null
              ) : (
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  disabled
                >
                  {getStatusText()}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 

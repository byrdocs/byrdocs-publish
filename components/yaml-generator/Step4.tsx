import { Button, ButtonKbd } from "@/components/ui/button";
import { TransparentButtonKbd } from "@/components/ui/transparent-button-kbd";
import {
  Download,
  RotateCcw,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FileType } from "@/lib/types";
import { generateYaml } from "@/lib/yaml";
import { CopyButton } from "@/components/copy-button";
import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import { useAuth } from "@/components/auth-provider";
import { useTopLoader } from "nextjs-toploader";

// 注册 YAML 语言支持
hljs.registerLanguage("yaml", yaml);

interface Step4Props {
  fileType: FileType;
  formData: any;
  actualTheme: string;
  hasDownloaded: boolean;
  isSubmitting: boolean;
  submissionSuccess: boolean;
  user: any;
  submitYaml: () => void;
  downloadYaml: () => void;
  createNewMetadata: () => void;
  setStep: (step: number) => void;
  setPreviousStep: (step: number) => void;
  step: number;
}

export function Step4({
  fileType,
  formData,
  actualTheme,
  hasDownloaded,
  isSubmitting,
  submissionSuccess,
  user,
  submitYaml,
  downloadYaml,
  createNewMetadata,
  setStep,
  setPreviousStep,
  step,
}: Step4Props) {
  const router = useRouter();
  const loader = useTopLoader();
  
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">预览和提交</h2>
        <p className="text-muted-foreground">检查生成的YAML文件并提交</p>
      </div>
      
      <div className="relative">
        <div className={`p-4 rounded-lg text-sm overflow-x-auto border yaml-highlight ${
          actualTheme === 'dark' ? 'yaml-dark' : 'yaml-light'
        }`}>
          <pre
            className="whitespace-pre-wrap m-0 pr-12"
            dangerouslySetInnerHTML={{
              __html: hljs.highlight(generateYaml(fileType, formData), { language: "yaml" }).value,
            }}
          />
        </div>
        <CopyButton
          content={generateYaml(fileType, formData)}
          className="absolute top-2 right-2 h-8 w-14 p-0"
          title="复制YAML内容"
          shortcut="c"
        />
      </div>
      
      {/* Success message - styled like /bind page */}
      {submissionSuccess && (
        <div className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 border rounded-lg p-3 px-3 sm:px-6">
          <div className="flex flex-row items-center gap-3 justify-between">
            <div className="space-y-2 py-2">
              <p className="font-medium text-green-800 dark:text-green-200 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                暂存成功
              </p>
              <p className="text-muted-foreground text-sm">
                如果没有其他文件，请在主页提交更改
              </p>
            </div>
            <Button 
              onClick={() => {
                loader.start();
                router.push('/');
              }}
              className="flex items-center bg-green-600 hover:bg-green-600/90 dark:bg-green-800 dark:hover:bg-green-800/90 text-white"
            >
              <span>返回主页</span>
              <TransparentButtonKbd>m</TransparentButtonKbd>
            </Button>
          </div>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row justify-between gap-2">
        {!hasDownloaded ? (
          <>
            <Button variant="outline" onClick={() => {
              setPreviousStep(step); // 防止触发自动focus
              setStep(3);
            }}>
              上一步
              <ButtonKbd>z</ButtonKbd>
            </Button>
            {user ? (
              <Button
                onClick={submitYaml}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    暂存
                  </>
                )}
                <TransparentButtonKbd>s</TransparentButtonKbd>
              </Button>
            ) : (
              <Button
                onClick={downloadYaml}
                className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white"
              >
                <Download className="w-4 h-4 mr-1" />
                下载 YAML 文件
                <TransparentButtonKbd>d</TransparentButtonKbd>
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => {
              setPreviousStep(step);
              setStep(3);
            }}>
              上一步
              <ButtonKbd>z</ButtonKbd>
            </Button>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={createNewMetadata}
                className="flex items-center w-full sm:w-auto"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                创建新的元信息
                <ButtonKbd>n</ButtonKbd>
              </Button>
              <Button
                onClick={downloadYaml}
                variant="outline"
              >
                <Download className="w-4 h-4 mr-1" />
                下载 YAML 文件
                <ButtonKbd>d</ButtonKbd>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

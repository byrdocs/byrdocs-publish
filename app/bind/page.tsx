"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, ButtonKbd, ShortcutProvider } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle,
  ExternalLink,
  RefreshCw,
  GitFork,
  Settings,
  Database,
  Info,
  ArrowRight,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { Avatar } from "@radix-ui/react-avatar";
import { AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { 
  getCurrentBinding, 
  getAvailableRepositories, 
  bindRepository,
  type Repository,
  type UserBinding 
} from './actions';
import { GithubIcon } from "@/components/icon/github";
import { TransparentButtonKbd } from "@/components/ui/transparent-button-kbd";
import { BackToHome } from "@/components/back-to-home";
import { useAuth } from "@/components/auth-provider";
import { useTopLoader } from 'nextjs-toploader';
import Image from "next/image";
import Link from "next/link";

export default function GitHubSetupPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [currentBinding, setCurrentBinding] = useState<UserBinding | null>(null);
  const [loading, setLoading] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindingStep, setBindingStep] = useState<'select' | 'confirm' | 'success'>('select');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const loader = useTopLoader();
  const { user, isLoading, refreshBinding, logout } = useAuth();

  const loadCurrentBinding = useCallback(async () => {
    try {
      const binding = await getCurrentBinding();
      setCurrentBinding(binding);
      if (binding) {
        setSelectedRepo(binding.repository);
        setBindingStep('confirm');
      }
    } catch (error) {
      console.error('Failed to load current binding:', error);
    }
  }, []);

  const fetchRepositories = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch repositories and refresh binding in parallel
      const [repos] = await Promise.all([
        getAvailableRepositories(),
        loadCurrentBinding() // Also refresh current binding
      ]);
      setRepositories(repos);
    } catch (err) {
      setError('获取仓库列表失败，请稍后重试');
      console.error('Error fetching repositories:', err);
    } finally {
      setLoading(false);
    }
  }, [loadCurrentBinding]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      loader.start()
      router.push(`/login?to=${encodeURIComponent('/bind')}`);
    }
  }, [user, isLoading, router, loader]);

  // Load current binding and repositories on mount
  useEffect(() => {
    // Only load data if user is authenticated
    if (user && !isLoading) {
      loadCurrentBinding();
      fetchRepositories();
    }
  }, [user, isLoading, loadCurrentBinding, fetchRepositories]);

  // Refresh repositories when page gains focus
  useEffect(() => {
    const handleFocus = () => {
      // Only refresh if the page is visible and not currently loading
      if (document.visibilityState === 'visible' && !loading) {
        fetchRepositories();
      }
    };

    // Add event listeners for both focus and visibility change
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    // Cleanup
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [loading, fetchRepositories]);

  const handleSelectRepository = (repo: Repository) => {
    setSelectedRepo(repo);
    setBindingStep('confirm');
  };

  const handleConfirmBinding = async () => {
    if (!selectedRepo || binding) return;
    
    setBinding(true);
    try {
      await bindRepository(selectedRepo.installationId);
      setCurrentBinding({
        id: 0, // Will be set after refresh
        repository: selectedRepo,
        createdAt: new Date().toISOString(),
      });
      
      // Refresh current binding to get accurate data
      await loadCurrentBinding();
      refreshBinding();
      setBindingStep('success');
    } catch (error) {
      setError('绑定仓库失败，请稍后重试');
      console.error('Error binding repository:', error);
    } finally {
      setBinding(false);
    }
  };

  const handleReturnHome = () => {
    loader.start()
    router.push('/');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Show loading state while checking authentication
  if (isLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>正在加载...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if user is not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <ShortcutProvider>
      <div className="min-h-screen py-8 bg-background">
        <div className="max-w-4xl mx-auto px-4">
          <BackToHome shortcut="m" />

          <div className="text-center mb-8 mt-2">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              GitHub 仓库设置
            </h1>
            <p className="text-muted-foreground">
              配置您的 BYR Docs 元信息仓库，开始编辑和管理文档
            </p>
          </div>

          {/* Current binding status */}
          {currentBinding && (
            <Card className="mb-6 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-green-800 dark:text-green-200">
                  <CheckCircle className="w-5 h-5" />
                  <span>当前绑定仓库</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-4">
                  <Image
                    src={currentBinding.repository.owner.avatar_url}
                    alt={currentBinding.repository.owner.login}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <Link
                      href={`https://github.com/${currentBinding.repository.full_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-lg text-green-800 dark:text-green-200 hover:underline"
                    >
                      {currentBinding.repository.full_name}
                    </Link>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      绑定于 {formatDate(currentBinding.createdAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {/* 第一步：Fork 仓库 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <GitFork className="w-5 h-5" />
                  <span>Fork 元信息仓库</span>
                </CardTitle>
                <CardDescription>
                  首先需要将 BYR Docs 官方元信息仓库 fork 到您的 GitHub
                  账户，这样您就拥有了自己的副本可以进行编辑
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onClick={() =>
                    window.open(
                      process.env.NEXT_PUBLIC_ARCHIVE_REPO_URL,
                      "_blank"
                    )
                  }
                  className="bg-muted/50 rounded-lg p-4 mb-4 cursor-pointer hover:bg-muted transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                        <GithubIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-foreground">
                          {`${process.env.NEXT_PUBLIC_ARCHIVE_REPO_OWNER}/${process.env.NEXT_PUBLIC_ARCHIVE_REPO_NAME}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          BYR Docs 元信息存档
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                  <div className="text-sm text-muted-foreground">
                    <p>• Fork 后您将拥有仓库的完整副本</p>
                    <p>• 可以在您的账户下自由编辑和管理</p>
                  </div>
                  <Button
                    onClick={() =>
                      window.open(
                        `${process.env.NEXT_PUBLIC_ARCHIVE_REPO_URL}/fork`,
                        "_blank"
                      )
                    }
                    className="flex items-center space-x-1 w-full sm:w-auto"
                  >
                    <GitFork className="w-4 h-4" />
                    <span>Fork 仓库</span>
                    <ExternalLink className="w-4 h-4" />
                    <ButtonKbd invert={true}>f</ButtonKbd>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 第二步：安装 GitHub App */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="w-5 h-5" />
                  <span>安装 BYR Docs Publish 应用</span>
                </CardTitle>
                <CardDescription>
                  在您 fork 的仓库上安装 BYR Docs Publish GitHub App，这样
                  Publish 就能访问和修改您的仓库内容
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onClick={() =>
                    window.open(
                      process.env.NEXT_PUBLIC_PUBLISH_APP_URL,
                      "_blank"
                    )
                  }
                  className="bg-muted/50 rounded-lg p-4 mb-4 cursor-pointer hover:bg-muted transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="rounded-full w-10 h-10 bg-blue-100/40 dark:bg-blue-900/40 flex items-center justify-center aspect-square">
                        <AvatarImage
                          src="/logo.png"
                          alt="@byrdocs"
                          className="w-6 h-6"
                        />
                        <AvatarFallback>BYR Docs</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-foreground">BYR Docs Publish</p>
                        <p className="text-sm text-muted-foreground">
                          BYR Docs Publish GitHub App，用于自动同步您的编辑
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
                <Alert className="my-4 flex items-center text-muted-foreground">
                  <div className="inline-block">
                    <div className="flex items-center">
                      <Info className="h-4 w-4 my-auto mr-2" />
                    </div>
                  </div>
                  <AlertTitle className="text-sm mb-0 flex">
                    <p>安装时请确保选择您在第一步 <span className="font-mono mx-1">fork</span> 的仓库</p>
                  </AlertTitle>
                </Alert>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                  <div className="text-sm text-muted-foreground">
                    <p>• 应用将获得仓库的读写权限</p>
                    <p>• 您可随时在 GitHub 设置中管理权限</p>
                  </div>
                  <Button
                    onClick={() =>
                      router.push(`${process.env.NEXT_PUBLIC_PUBLISH_APP_URL}/installations/new`)
                    }
                    className="flex items-center space-x-1 w-full sm:w-auto"
                  >
                    <Settings className="w-4 h-4" />
                    <span>安装应用</span>
                    <ButtonKbd invert={true}>i</ButtonKbd>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 第三步：选择绑定仓库 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Database className="w-5 h-5" />
                    <span>选择绑定的仓库</span>
                  </div>

                  <Button
                    variant="outline"
                    onClick={fetchRepositories}
                    disabled={loading}
                    className="flex items-center bg-transparent text-foreground"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                    />
                    <ButtonKbd>r</ButtonKbd>
                  </Button>
                </CardTitle>
                <CardDescription>
                  从已安装应用的仓库中选择一个进行绑定，之后您在网站上的所有编辑都会同步到这个仓库
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <Alert className="mb-4 border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive">
                    <AlertDescription className="space-y-3">
                      <div>{error}</div>
                      <div className="text-sm">
                        如果重试多次后仍然无法获取仓库列表，建议尝试重新登录。
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={logout}
                        className="flex items-center gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>登出</span>
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {loading && repositories.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                    <span>正在获取仓库列表...</span>
                  </div>
                ) : repositories.length > 0 ? (
                  <div className="space-y-3">
                    {repositories.map((repo, index) => (
                      <div
                        key={repo.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                          selectedRepo?.full_name === repo.full_name
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-muted-foreground"
                        }`}
                        onClick={() => handleSelectRepository(repo)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">

                          <CheckCircle
                              className={`w-5 h-5 ${
                                selectedRepo?.id === repo.id
                                  ? "text-primary"
                                  : "text-muted-foreground"
                              }`}
                            />
                            <Image
                              src={repo.owner.avatar_url}
                              alt={repo.owner.login}
                              width={40}
                              height={40}
                              className="w-10 h-10 rounded-full"
                            />
                            <div>
                              <p className="font-medium text-lg text-foreground">
                                {repo.full_name}
                              </p>
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-1">
                                <span>
                                  更新于 {formatDate(repo.updated_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost" className="pointer-events-none"
                              onClick={() => {
                                setSelectedRepo(repo);
                                setBindingStep('confirm');
                              }}
                            >
                              <ButtonKbd>{(index + 1).toString()}</ButtonKbd>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Database className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      暂无可用仓库
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      请确保已经完成前面的步骤
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.open(
                            `${process.env.NEXT_PUBLIC_ARCHIVE_REPO_URL}/fork`,
                            "_blank"
                          )
                        }
                        className="flex items-center space-x-1"
                      >
                        <GitFork className="w-4 h-4" />
                        <span>Fork 仓库</span>
                        <ExternalLink className="w-4 h-4" />
                        <ButtonKbd>f</ButtonKbd>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          router.push(`${process.env.NEXT_PUBLIC_PUBLISH_APP_URL}/installations/new`)
                        }
                        className="flex items-center space-x-1"
                      >
                        <Settings className="w-4 h-4" />
                        <span>安装应用</span>
                        <ButtonKbd>i</ButtonKbd>
                      </Button>
                    </div>
                  </div>
                )}

                {selectedRepo && bindingStep === 'confirm' && (
                  <div className="mt-6 pt-6 border-t bg-muted/30 -mx-6 px-6 -mb-6 pb-6 rounded-b-lg">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          当前选择的仓库
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {selectedRepo.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                          绑定后，您在网站上的所有编辑都会自动同步到此仓库
                        </p>
                      </div>
                      <Button 
                        onClick={handleConfirmBinding}
                        disabled={binding}
                        className="flex items-center w-full sm:w-auto"
                      >
                        {binding ? (
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-2" />
                        )}
                        <span>{binding ? '绑定中...' : '确认绑定'}</span>
                        <ButtonKbd invert={true}>b</ButtonKbd>
                      </Button>
                    </div>
                  </div>
                )}

                {selectedRepo && bindingStep === 'success' && (
                  <div className="mt-6 pt-6 border-t bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 -mx-6 px-6 -mb-6 pb-6 rounded-b-lg">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200 flex items-center">
                          <CheckCircle className="w-5 h-5 mr-2" />
                          绑定成功！
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          已成功绑定仓库 {selectedRepo.full_name}
                        </p>
                      </div>
                      <Button 
                        onClick={handleReturnHome}
                        className="flex items-center bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                      >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        <span>返回首页</span>
                        <TransparentButtonKbd>h</TransparentButtonKbd>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ShortcutProvider>
  );
}

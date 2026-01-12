'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { handleGitHubCallback } from './actions';
import { useAuth } from '@/components/auth-provider';
import { Loader2 } from 'lucide-react';
import { useTopLoader } from 'nextjs-toploader';

export const runtime = 'edge';

function GitHubCallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const router = useRouter();
  const { refreshUser, refreshBinding } = useAuth();
  const loader = useTopLoader();
  useEffect(() => {
    if (code) {
      handleGitHubCallback(code, state || undefined).then(async (redirectUrl) => {
        if (state === 'close') {
          window.close();
          return
        }
        await refreshUser();
        await refreshBinding();
        loader.start();
        router.push(redirectUrl);
      }).catch((error) => {
        console.error('Failed to handle GitHub callback:', error);
      });
    }
  }, [code, state, refreshUser, refreshBinding, router, loader]);

  if (!code) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="rounded-full h-8 w-8 bg-red-500 flex items-center justify-center mx-auto mb-4">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-red-600 font-medium mb-2">登录失败</p>
          <p className="text-gray-500 text-sm">未找到授权码</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 " />
        <p>正在登录...</p>
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    }>
      <GitHubCallbackContent />
    </Suspense>
  );
}
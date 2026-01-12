import { redirect } from 'next/navigation';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { cookies } from 'next/headers';

export const runtime = 'edge';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const env = getRequestContext().env;
  const params = await searchParams;
  const state = params.close ? 'close' : (params.to && typeof params.to === 'string' ? params.to : 'normal');
  const origin = process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_DEV_SITE_BASE_URL : process.env.NEXT_PUBLIC_PUBLISH_SITE_BASE_URL;
  const clientId = env.GITHUB_CLIENT_ID || '';
  
  redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${origin}/callback/github&state=${encodeURIComponent(state)}`);
}

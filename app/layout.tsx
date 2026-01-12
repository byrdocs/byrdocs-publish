import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { EscapeHandler } from '@/components/escape-handler'
import { AuthProvider } from '@/components/auth-provider'
import { Navigation } from '@/components/navigation'
import { Footer } from '@/components/footer'
import NextTopLoader from 'nextjs-toploader';
import { getUserInfo, getTokenFromCookie } from '@/lib/auth'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: 'BYR Docs Publish',
  description: '上传文件和编写元信息',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Get token and user info on server side to avoid loading state
  const [initialToken, initialUser] = await Promise.all([
    getTokenFromCookie(),
    getUserInfo().catch(() => null)
  ]);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <ThemeProvider>
          <AuthProvider initialUser={initialUser} initialToken={initialToken} syncOnFocus={true}>
            <NextTopLoader />
            <EscapeHandler />
            <Navigation />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

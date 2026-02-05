"use client";

import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from '@/lib/auth-actions';
import { getCurrentBinding, type UserBinding } from '@/app/bind/actions';
import type { UserInfo } from '@/lib/auth';
import { deleteServerCookie, getServerCookie } from '@/lib/server-cookie';
import { useRouter, usePathname } from 'next/navigation';
import { useTopLoader } from 'nextjs-toploader';

interface AuthContextType {
  token: string | null;
  user: UserInfo | null;
  binding: UserBinding | null;
  isLoading: boolean;
  isBindingLoading: boolean;
  login: (currentPath?: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  refreshBinding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: UserInfo | null;
  initialToken?: string | null;
  syncOnFocus?: boolean;
}

export function AuthProvider({ children, initialUser = null, initialToken = null, syncOnFocus = false }: AuthProviderProps) {
  const loader = useTopLoader();
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(initialToken);
  const [user, setUser] = useState<UserInfo | null>(initialUser);
  const [binding, setBinding] = useState<UserBinding | null>(null);
  const [isLoading, setIsLoading] = useState(!initialUser && !initialToken);
  const [isBindingLoading, setIsBindingLoading] = useState(false);

  const refreshUser = async () => {
    try {
      setIsLoading(true);
      // Get token from cookie
      const currentToken = await getServerCookie('token');
      setToken(currentToken);

      if (currentToken) {
        const userInfo = await getCurrentUser();
        setUser(userInfo);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshBinding = useCallback(async () => {
    try {
      setIsBindingLoading(true);
      const currentBinding = await getCurrentBinding();
      setBinding(currentBinding);
    } catch (error) {
      console.error('Failed to refresh binding:', error);
      setBinding(null);
    } finally {
      setIsBindingLoading(false);
    }
  }, []);

  const login = (currentPath?: string) => {
    const redirectTo = currentPath ? `?to=${encodeURIComponent(currentPath)}` : '';
    loader.start()
    router.push(`/login${redirectTo}`);
  };

  const logout = async () => {
    await deleteServerCookie('token');
    setToken(null);
    setUser(null);
    setBinding(null);
    
    // Redirect to home page if not already on / or /add
    if (pathname !== '/' && pathname !== '/add') {
      loader.start()
      router.push('/');
    }
  };

  // Load user info on mount if not provided initially
  useEffect(() => {
    if (!initialUser) {
      refreshUser();
    }
  }, [initialUser]);

  // Load binding when user is available
  useEffect(() => {
    if (user && !isLoading) {
      refreshBinding();
    }
  }, [user, isLoading, refreshBinding]);

  // Sync authentication state on window focus
  useEffect(() => {
    if (!syncOnFocus) return;

    const handleFocus = () => {
      // Only refresh if not already loading
      if (!isLoading) {
        refreshUser();
      }
    };

    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncOnFocus, isLoading]);

  return (
    <AuthContext.Provider value={{ 
      token,
      user, 
      binding, 
      isLoading, 
      isBindingLoading, 
      login,
      logout, 
      refreshUser, 
      refreshBinding 
    }}>
      {children}
    </AuthContext.Provider>
  );
}
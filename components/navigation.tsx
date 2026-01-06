"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { 
  LogOut, 
  GitBranch,
} from 'lucide-react';
import { GithubIcon } from './icon/github';
import { useTopLoader } from 'nextjs-toploader';

export function Navigation() {
  const { user, binding, login, logout, isBindingLoading } = useAuth();
  const loader = useTopLoader();
  const router = useRouter();

  const handleBindingClick = () => {
    loader.start();
    router.push('/bind');
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Title */}
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2">
              <h1 className="text-xl font-semibold text-foreground">
                BYR Docs Publish
              </h1>
            </Link>
          </div>

          {/* Right side - Content depends on auth status */}
          <div className="items-center flex">
            {user ? (
              <>
                {/* Repository binding status */}
                {(!isBindingLoading || binding) && (
                  <Button
                    variant="ghost"
                    onClick={handleBindingClick}
                    className="items-center hidden sm:flex"
                  >
                    <GitBranch className="w-4 h-4" />
                    {binding ? (
                      <span className="text-sm">{binding.repository.full_name}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">绑定仓库</span>
                    )}
                  </Button>
                )}
                {/* User menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="flex items-center px-4"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage 
                          src={`https://github.com/${user.username}.png`} 
                          alt={user.username} 
                        />
                        <AvatarFallback>
                          {user.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium hidden sm:block">{user.username}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="flex flex-col space-y-1 p-2">
                      <p className="text-sm font-medium">{user.username}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleBindingClick} className='cursor-pointer flex sm:hidden'>
                      <GitBranch className="w-4 h-4" />
                      {binding ? binding.repository.full_name : '绑定仓库'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className='block sm:hidden'/>
                    <DropdownMenuItem 
                      onClick={handleLogout}
                      className="text-red-600 focus:text-red-600 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      登出
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              /* Login button when not authenticated */
              <Button onClick={() => login()} variant="outline" className="flex items-center space-x-1">
                <GithubIcon className="w-5 h-5" />
                <span>登录</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
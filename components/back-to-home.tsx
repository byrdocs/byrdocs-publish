"use client";

import { useRouter } from "next/navigation";
import { Button, ButtonKbd } from "./ui/button";
import { ArrowLeft } from "lucide-react";
import { useTopLoader } from 'nextjs-toploader';

interface BackToPageProps {
  shortcut?: string;
  path: string;
  children?: React.ReactNode;
}


export function BackToPage({ shortcut, children, path }: BackToPageProps) {
  const router = useRouter();
  const loader = useTopLoader();

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => {
          loader.start()
          router.push(path)
        }}
        className="flex items-center text-muted-foreground p-4 h-12 w-full justify-start font-normal group"
      >
        <span className="transition-transform duration-200 group-hover:-translate-x-1">
          <ArrowLeft className="w-4 h-4" />
        </span>
        <span>{children}</span>
        {shortcut && <ButtonKbd>{shortcut}</ButtonKbd>}
      </Button>
    </div>
  );
}

export function BackToHome({ shortcut }: { shortcut?: string } = {}) {
  return <BackToPage path="/" shortcut={shortcut}>返回首页</BackToPage>;
}

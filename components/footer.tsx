import Link from "next/link";
import { GithubIcon } from "./icon/github";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t bg-background mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center space-x-3 py-4">
          <Link 
            href={process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground hover:underline group transition-colors"
          >
            <Image height={16} width={16} src="/logo.svg" alt="BYR Docs" className="inline-block w-4 h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
            <span>BYR Docs</span>
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link 
            href="https://github.com/byrdocs/" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            <GithubIcon className="w-4 h-4" />
            <span>GitHub</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}

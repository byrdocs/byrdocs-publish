// Define them in .dev.vars
interface CloudflareEnv {
  DB: D1Database;
  GITHUB_APP_PRIVATE_KEY: string;
  APP_ID: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  WEBHOOK_SECRET: string;
}

// Define them in .env
declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_SITE_BASE_URL: string;
    NEXT_PUBLIC_DATA_BASE_URL: string;
    NEXT_PUBLIC_PUBLISH_SITE_BASE_URL: string;
    NEXT_PUBLIC_DEV_SITE_BASE_URL: string;
    NEXT_PUBLIC_PUBLISH_APP_BASE_URL: string;
  }
}

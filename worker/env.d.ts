interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  AUTH_USER: string;
  AUTH_PASS_HASH: string;
  SESSION_SECRET: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
}

import { createBrowserClient } from "@supabase/ssr";

let _supabase: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser Supabase client — singleton, used in client components.
 *
 * Uses @supabase/ssr's cookie-based client so the session lives in
 * cookies, which server components (`createAuthClient`) and server
 * actions can read. The plain supabase-js client stores the session in
 * localStorage, which the server never sees — that broke navigation to
 * /editor after sign-in (server saw no session and re-rendered the form).
 */
export function getSupabase() {
  if (_supabase) return _supabase;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}

/** Legacy export — use getSupabase() instead. */
export const supabase = new Proxy(
  {} as unknown as ReturnType<typeof createBrowserClient>,
  {
    get(_, prop) {
      const client = getSupabase();
      const val = (client as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? val.bind(client) : val;
    },
  }
) as ReturnType<typeof createBrowserClient>;
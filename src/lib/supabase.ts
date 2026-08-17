import { createClient } from "@supabase/supabase-js";

let _supabase: ReturnType<typeof createClient> | null = null;

/**
 * Browser Supabase client — singleton, used in client components.
 * Respects RLS via anon key.
 * Lazily created so the module can be imported at build time without env vars.
 */
export function getSupabase() {
  if (_supabase) return _supabase;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return _supabase;
}

/** Legacy export — use getSupabase() instead. */
export const supabase = new Proxy({} as unknown as ReturnType<typeof createClient>, {
  get(_, prop) {
    const client = getSupabase();
    const val = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
}) as ReturnType<typeof createClient>;
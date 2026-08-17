import { createAuthClient } from "@/lib/supabase-server";
import type { User } from "@supabase/supabase-js";

/**
 * Get the authenticated user from the server side.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Require authentication — throws if not authenticated.
 */
export async function requireAuth(): Promise<User> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error("Unauthorized: authentication required");
  }
  return user;
}
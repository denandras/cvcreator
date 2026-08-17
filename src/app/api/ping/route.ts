import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";

/**
 * Lightweight keepalive endpoint.
 *
 * Called by the client every 5 minutes when the tab is visible and a
 * session exists.  Touching the Supabase session here refreshes the
 * JWT expiry and resets the server-side idle timer so the user is
 * not logged out during prolonged inactivity.
 *
 * Returns 200 with a tiny JSON body on success, 401 if no session.
 */
export async function GET() {
  try {
    const supabase = await createAuthClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, session: false }, { status: 401 });
    }

    // Explicitly refresh the token — getSession already does this when
    // the token is close to expiry, but calling refresh ensures the
    // server cookie is always up to date.
    await supabase.auth.refreshSession();

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
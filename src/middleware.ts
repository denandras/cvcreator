import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/_next") ||
    path.startsWith("/api") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies
          .getAll()
          .map((c) => ({ name: c.name, value: c.value }));
      },
      setAll() {
        // Can't set cookies in middleware response easily; skip
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (path.startsWith("/editor") && !session) {
    const redirectUrl = new URL("/signin", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/editor/:path*"],
};
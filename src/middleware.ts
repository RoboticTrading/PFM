import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE, authConfigured, isAuthed } from "@/lib/auth";

/**
 * PIN gate. Every page + API request must carry a valid session cookie, else
 * it's bounced to /login (pages) or rejected 401 (API). /login and the login
 * action are open. If the gate isn't configured (no PFM_PIN/secret), it's a
 * no-op so dev/CI aren't locked out — production sets both.
 */
export function middleware(req: NextRequest) {
  if (!authConfigured()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  if (isAuthed(req.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except Next internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

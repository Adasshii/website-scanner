import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// QUICK-260730-oiy: getRequestConfig (i18n/request.ts) cannot see the
// request path in the Next.js 14 App Router, so this middleware forwards it
// via an `x-pathname` header. That is the only job this file has.
//
// Matcher is scoped to `/report/:path*` ONLY. The public scanner (`/`,
// `/start`, `/scan/<id>`) earns revenue today and must not start passing
// through middleware — every route added here is a new failure surface on
// a path that currently works. No DB access, no auth, no redirects, no
// cookie writes.
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  // `set`, not `append`: a client cannot smuggle a second x-pathname value.
  headers.set("x-pathname", request.nextUrl.pathname);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/report/:path*"],
};

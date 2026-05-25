import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { unsealData } from "iron-session"

const SESSION_COOKIE = "jarvis_session"
const SESSION_SECRET = process.env.SESSION_SECRET || "jarvis-secret-change-in-production-32chars-min-length"
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "jarvis-internal-secret-key"
const TTL_SECONDS = 60 * 60 * 24 * 7

async function isValidSession(token: string): Promise<boolean> {
  try {
    const data = await unsealData<{ loggedIn: boolean }>(token, {
      password: SESSION_SECRET,
      ttl: TTL_SECONDS,
    })
    return data.loggedIn === true
  } catch {
    return false
  }
}

function stripHeaders(res: NextResponse): NextResponse {
  res.headers.delete("x-nextjs-stale-time")
  res.headers.delete("x-nextjs-prerender")
  res.headers.delete("x-nextjs-cache")
  res.headers.delete("x-nextjs-matched-path")
  res.headers.delete("vary")
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow internal server-to-server calls
  const internalSecret = request.headers.get("x-internal-secret")
  if (internalSecret && internalSecret === INTERNAL_SECRET) {
    return stripHeaders(NextResponse.next())
  }

  // Allow auth API routes and login page
  if (
    pathname.startsWith("/api/jarvis/auth") ||
    pathname.startsWith("/api/jarvis/google-callback") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/google-setup") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return stripHeaders(NextResponse.next())
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token || !(await isValidSession(token))) {
    return stripHeaders(NextResponse.redirect(new URL("/login", request.url)))
  }

  return stripHeaders(NextResponse.next())
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*))"],
}

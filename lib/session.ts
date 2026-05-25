import { sealData, unsealData } from "iron-session"
import { cookies } from "next/headers"

const SESSION_COOKIE = "jarvis_session"
const SESSION_SECRET = process.env.SESSION_SECRET || "jarvis-secret-change-in-production-32chars-min-length"
const TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

export interface JarvisSession {
  loggedIn: boolean
  createdAt: number
}

function sealOptions() {
  return {
    password: SESSION_SECRET,
    ttl: TTL_SECONDS,
  }
}

export async function createSession(): Promise<string> {
  const payload: JarvisSession = { loggedIn: true, createdAt: Date.now() }
  const token = await sealData(payload, sealOptions())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: TTL_SECONDS,
    path: "/",
  })

  return token
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE)?.value
}

export async function validateSession(token?: string): Promise<boolean> {
  if (!token) {
    token = await getSessionToken()
    if (!token) return false
  }

  try {
    const data = await unsealData<JarvisSession>(token, sealOptions())
    return data.loggedIn === true
  } catch {
    return false
  }
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

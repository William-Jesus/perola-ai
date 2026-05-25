/**
 * In-memory rate limiter with sliding window.
 * Ready for Redis upgrade: swap the Map for Redis commands.
 */

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetAt: number
}

interface Bucket {
  tokens: number
  lastRefill: number
}

const store = new Map<string, Bucket>()

/**
 * Token-bucket rate limiter.
 * @param key     unique identifier (e.g. IP + route)
 * @param limit   max tokens in the bucket
 * @param windowMs time window in ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = store.get(key)

  if (!bucket) {
    store.set(key, { tokens: limit - 1, lastRefill: now })
    return { success: true, limit, remaining: limit - 1, resetAt: now + windowMs }
  }

  const elapsed = now - bucket.lastRefill
  const refillRate = limit / windowMs
  const tokensToAdd = elapsed * refillRate

  bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd)
  bucket.lastRefill = now

  if (bucket.tokens < 1) {
    const waitMs = Math.ceil((1 - bucket.tokens) / refillRate)
    return { success: false, limit, remaining: 0, resetAt: now + waitMs }
  }

  bucket.tokens -= 1
  store.set(key, bucket)
  return { success: true, limit, remaining: Math.floor(bucket.tokens), resetAt: now + windowMs }
}

/** Get client IP from Next.js request */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  // fallback — cannot easily get remoteAddress from standard Request
  return "unknown"
}

/** Helper to apply rate limit and return NextResponse if exceeded */
export function checkRateLimit(
  req: Request,
  route: string,
  limit: number,
  windowMs: number = 60_000
): { allowed: true } | { allowed: false; response: Response } {
  const ip = getClientIP(req)
  const key = `${ip}:${route}`
  const result = rateLimit(key, limit, windowMs)

  if (!result.success) {
    const res = new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetAt),
      },
    })
    return { allowed: false, response: res }
  }

  return { allowed: true }
}

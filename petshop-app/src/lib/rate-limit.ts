import { headers } from 'next/headers'

// In-memory store for rate limiting. 
// Note: In serverless environments (like Vercel), this state might reset frequently 
// ou vary per lambda instance. However, it still provides a baseline layer of protection 
// against aggressive bot attacks targeting a single instance.
const rateLimitStore = new Map<string, { count: number; expiresAt: number }>()

export async function checkRateLimit(
  actionName: string, 
  limit: number = 5, 
  windowMinutes: number = 15
): Promise<{ success: boolean; retryAfter?: number }> {
  const headersList = await headers()
  // Try to get real IP from standard proxies, fallback to 'unknown'
  const ip = headersList.get('x-forwarded-for') ?? 
             headersList.get('x-real-ip') ?? 
             'unknown'
             
  const key = `${actionName}:${ip}`
  const now = Date.now()
  const windowMs = windowMinutes * 60 * 1000

  const record = rateLimitStore.get(key)

  if (!record || record.expiresAt < now) {
    // New or expired record
    rateLimitStore.set(key, { count: 1, expiresAt: now + windowMs })
    return { success: true }
  }

  if (record.count >= limit) {
    // Rate limit exceeded
    const retryAfterSeconds = Math.ceil((record.expiresAt - now) / 1000)
    return { success: false, retryAfter: retryAfterSeconds }
  }

  // Increment existing record
  record.count++
  return { success: true }
}

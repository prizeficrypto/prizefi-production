import { db } from '../../db'
import { rateLimits } from '../../db/schema'
import { eq, and, gt } from 'drizzle-orm'

// Rate limits are PER-USER, not global
// System designed to handle 1000s of concurrent users (40+ submissions/min globally)
// Each user gets their own rate limit window
const RATE_LIMITS = {
  'run/start': { maxRequests: 10, windowMs: 60000 }, // 10 per min per user (allows retries)
  'run/finish': { maxRequests: 10, windowMs: 60000 }, // 10 per min per user (allows retries)
  'claim': { maxRequests: 5, windowMs: 300000 }, // 5 per 5 min per user
  'claim/proof': { maxRequests: 20, windowMs: 60000 }, // 20 per min per user
  'event/claim-data': { maxRequests: 20, windowMs: 60000 }, // 20 per min per user
  'event/current': { maxRequests: 120, windowMs: 60000 }, // 120 per min per user (frequent polling)
  'leaderboard': { maxRequests: 60, windowMs: 60000 }, // 60 per min per user
  'profile': { maxRequests: 60, windowMs: 60000 }, // 60 per min per user
  'me/credits': { maxRequests: 60, windowMs: 60000 }, // 60 per min per user
  'event': { maxRequests: 120, windowMs: 60000 }, // 120 per min per user
  'update_username': { maxRequests: 5, windowMs: 300000 }, // 5 per 5 min per user
}

export async function checkRateLimit(
  address: string,
  endpoint: keyof typeof RATE_LIMITS
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limit = RATE_LIMITS[endpoint]
  if (!limit) return { allowed: true }

  const now = new Date()
  const windowStart = new Date(now.getTime() - limit.windowMs)

  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.address, address),
        eq(rateLimits.endpoint, endpoint),
        gt(rateLimits.windowStart, windowStart)
      )
    )
    .limit(1)

  if (existing) {
    if (existing.count >= limit.maxRequests) {
      const retryAfter = Math.ceil(
        (existing.windowStart.getTime() + limit.windowMs - now.getTime()) / 1000
      )
      return { allowed: false, retryAfter }
    }

    await db
      .update(rateLimits)
      .set({ count: existing.count + 1 })
      .where(eq(rateLimits.id, existing.id))
  } else {
    await db
      .delete(rateLimits)
      .where(
        and(
          eq(rateLimits.address, address),
          eq(rateLimits.endpoint, endpoint)
        )
      )

    await db.insert(rateLimits).values({
      address,
      endpoint,
      count: 1,
      windowStart: now,
    })
  }

  return { allowed: true }
}

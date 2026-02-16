import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { rateLimits } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowMs)

  try {
    // Get existing rate limit record
    const existing = await db
      .select()
      .from(rateLimits)
      .where(
        and(
          eq(rateLimits.address, identifier),
          eq(rateLimits.endpoint, endpoint)
        )
      )
      .limit(1)

    if (existing.length === 0) {
      // Create new rate limit record
      await db.insert(rateLimits).values({
        address: identifier,
        endpoint,
        count: 1,
        windowStart: now,
      })
      return {
        allowed: true,
        remaining: maxAttempts - 1,
        resetAt: new Date(now.getTime() + windowMs),
      }
    }

    const record = existing[0]

    // Check if window has expired
    if (record.windowStart < windowStart) {
      // Reset window
      await db
        .update(rateLimits)
        .set({
          count: 1,
          windowStart: now,
        })
        .where(eq(rateLimits.id, record.id))

      return {
        allowed: true,
        remaining: maxAttempts - 1,
        resetAt: new Date(now.getTime() + windowMs),
      }
    }

    // Check if limit exceeded
    if (record.count >= maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(record.windowStart.getTime() + windowMs),
      }
    }

    // Increment count
    await db
      .update(rateLimits)
      .set({
        count: record.count + 1,
      })
      .where(eq(rateLimits.id, record.id))

    return {
      allowed: true,
      remaining: maxAttempts - (record.count + 1),
      resetAt: new Date(record.windowStart.getTime() + windowMs),
    }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Fail open to avoid blocking legitimate users on DB errors
    return {
      allowed: true,
      remaining: maxAttempts,
      resetAt: new Date(now.getTime() + windowMs),
    }
  }
}

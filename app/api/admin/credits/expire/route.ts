import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { credits, auditLogs } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getClientIP } from '@/app/lib/admin-auth'

const sqlClient = neon(process.env.DATABASE_URL!)
const db = drizzle(sqlClient)

async function verifyApiKey(apiKey: string | null): Promise<boolean> {
  if (!apiKey) return false
  return apiKey === process.env.ADMIN_API_KEY
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-admin-key')
    
    if (!await verifyApiKey(apiKey)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const now = new Date()

    const expiredCredits = await db
      .update(credits)
      .set({
        expiredAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(credits.used, false),
        sql`${credits.expiredAt} IS NULL`
      ))
      .returning()

    await db.insert(auditLogs).values({
      action: 'EXPIRE_CREDITS',
      adminEmail: 'api-key',
      metadata: JSON.stringify({
        expiredCount: expiredCredits.length,
        expiredCredits: expiredCredits.map(c => ({
          address: c.address,
          eventId: c.eventId,
        })),
      }),
      ipAddress: getClientIP(req),
    })

    return NextResponse.json({
      success: true,
      expiredCount: expiredCredits.length,
      message: `Expired ${expiredCredits.length} unused credits`,
    })
  } catch (error) {
    console.error('Expire credits error:', error)
    return NextResponse.json(
      { error: 'Failed to expire credits' },
      { status: 500 }
    )
  }
}

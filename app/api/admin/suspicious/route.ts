import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { paymentIntents, users } from '@/db/schema'
import { eq, isNull, or, desc, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-admin-key')
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const suspicious = await db
    .select({
      txHash: paymentIntents.txHash,
      address: paymentIntents.address,
      eventId: paymentIntents.eventId,
      createdAt: paymentIntents.createdAt,
      chainVerified: paymentIntents.chainVerified,
      chainVerifiedAt: paymentIntents.chainVerifiedAt
    })
    .from(paymentIntents)
    .where(eq(paymentIntents.chainVerified, false))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(100)

  const pending = await db
    .select({
      txHash: paymentIntents.txHash,
      address: paymentIntents.address,
      eventId: paymentIntents.eventId,
      createdAt: paymentIntents.createdAt
    })
    .from(paymentIntents)
    .where(isNull(paymentIntents.chainVerified))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(100)

  const stats = await db
    .select({
      total: sql<number>`count(*)`,
      verified: sql<number>`sum(case when chain_verified = true then 1 else 0 end)`,
      suspicious: sql<number>`sum(case when chain_verified = false then 1 else 0 end)`,
      pending: sql<number>`sum(case when chain_verified is null then 1 else 0 end)`
    })
    .from(paymentIntents)

  return NextResponse.json({
    stats: stats[0],
    suspicious,
    pendingVerification: pending
  })
}

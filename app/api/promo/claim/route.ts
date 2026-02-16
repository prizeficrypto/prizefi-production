import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { credits, events, users, userRewards } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address: rawAddress, promoId, rewardType } = body

    if (!rawAddress || !rewardType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const address = rawAddress.toLowerCase()

    await db.insert(users).values({
      address,
      isVerified: false,
    }).onConflictDoNothing()

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    if (rewardType === 'free_play') {
      const [activeEvent] = await db
        .select()
        .from(events)
        .where(eq(events.frozen, false))
        .orderBy(desc(events.startsAt))
        .limit(1)

      if (activeEvent) {
        const [existingCredit] = await db
          .select()
          .from(credits)
          .where(and(eq(credits.address, address), eq(credits.eventId, activeEvent.id)))
          .limit(1)

        if (existingCredit) {
          await db.update(credits)
            .set({ balance: existingCredit.balance + 1, updatedAt: now })
            .where(eq(credits.id, existingCredit.id))
        } else {
          await db.insert(credits).values({
            address,
            eventId: activeEvent.id,
            balance: 1,
          })
        }
      }

      await db.insert(userRewards).values({
        address,
        rewardType: 'free_play',
        promoId: promoId || null,
        used: true,
        usedAt: now,
      })

      return NextResponse.json({
        success: true,
        rewardType: 'free_play',
        message: 'Free play added to your account!'
      })
    }

    if (rewardType === 'discount') {
      await db.insert(userRewards).values({
        address,
        rewardType: 'discount',
        discountPercent: 20,
        promoId: promoId || null,
        used: false,
        expiresAt,
      })

      return NextResponse.json({
        success: true,
        rewardType: 'discount',
        discountPercent: 20,
        message: '20% discount applied to your next entry!'
      })
    }

    return NextResponse.json({ success: true, rewardType })
  } catch (error) {
    console.error('Error claiming promo reward:', error)
    return NextResponse.json({ error: 'Failed to claim reward' }, { status: 500 })
  }
}

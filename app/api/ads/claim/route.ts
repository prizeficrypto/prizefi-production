import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bannerAds, adViews, credits, events } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { viewId, address } = body

    if (!viewId || !address) {
      return NextResponse.json({ error: 'Missing viewId or address' }, { status: 400 })
    }

    const [view] = await db
      .select()
      .from(adViews)
      .where(and(eq(adViews.id, viewId), eq(adViews.address, address)))
      .limit(1)

    if (!view) {
      return NextResponse.json({ error: 'Ad view not found' }, { status: 404 })
    }

    if (view.rewardClaimed) {
      return NextResponse.json({ 
        success: true, 
        alreadyClaimed: true,
        message: 'Reward already claimed' 
      })
    }

    const [ad] = await db
      .select()
      .from(bannerAds)
      .where(eq(bannerAds.id, view.adId))
      .limit(1)

    if (!ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
    }

    await db.update(adViews)
      .set({ completed: true, rewardClaimed: true })
      .where(eq(adViews.id, viewId))

    let rewardGranted = false
    let rewardDetails: any = {}

    if (ad.rewardType === 'free_play') {
      const now = new Date()
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
            .set({ balance: existingCredit.balance + (ad.rewardAmount || 1), updatedAt: now })
            .where(eq(credits.id, existingCredit.id))
        } else {
          await db.insert(credits).values({
            address,
            eventId: activeEvent.id,
            balance: ad.rewardAmount || 1,
          })
        }
        rewardGranted = true
        rewardDetails = {
          type: 'free_play',
          amount: ad.rewardAmount || 1,
          eventId: activeEvent.id,
        }
      }
    }

    return NextResponse.json({
      success: true,
      rewardGranted,
      reward: rewardDetails,
    })
  } catch (error) {
    console.error('Error claiming ad reward:', error)
    return NextResponse.json({ error: 'Failed to claim reward' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bannerAds, adViews } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { adId, address } = body

    if (!adId || !address) {
      return NextResponse.json({ error: 'Missing adId or address' }, { status: 400 })
    }

    const [ad] = await db
      .select()
      .from(bannerAds)
      .where(and(eq(bannerAds.id, adId), eq(bannerAds.active, true)))
      .limit(1)

    if (!ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
    }

    await db.update(bannerAds)
      .set({ impressions: (ad.impressions || 0) + 1 })
      .where(eq(bannerAds.id, adId))

    const [existingView] = await db
      .select()
      .from(adViews)
      .where(and(eq(adViews.adId, adId), eq(adViews.address, address)))
      .limit(1)

    if (existingView && existingView.completed) {
      return NextResponse.json({ 
        success: true, 
        alreadyWatched: true,
        message: 'Ad already completed' 
      })
    }

    const [view] = await db.insert(adViews).values({
      adId,
      address,
      completed: false,
    }).returning()

    return NextResponse.json({
      success: true,
      viewId: view.id,
      adType: ad.adType,
      rewardType: ad.rewardType,
      rewardAmount: ad.rewardAmount,
    })
  } catch (error) {
    console.error('Error recording ad watch:', error)
    return NextResponse.json({ error: 'Failed to record ad watch' }, { status: 500 })
  }
}

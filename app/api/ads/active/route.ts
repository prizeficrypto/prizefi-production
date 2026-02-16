import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bannerAds } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const activeAds = await db
      .select()
      .from(bannerAds)
      .where(eq(bannerAds.active, true))
      .limit(5)
    
    return NextResponse.json({
      ads: activeAds.map(ad => ({
        id: ad.id,
        title: ad.title,
        description: ad.description,
        imageUrl: ad.imageUrl,
        targetUrl: ad.targetUrl,
        adType: ad.adType,
        rewardType: ad.rewardType,
        rewardAmount: ad.rewardAmount,
      }))
    })
  } catch (error) {
    console.error('Error fetching active ads:', error)
    return NextResponse.json({ ads: [] })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { userRewards } from '@/db/schema'
import { and, gt, isNull, or, sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawAddress = searchParams.get('address')

    if (!rawAddress) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 })
    }

    const address = rawAddress.toLowerCase()
    const now = new Date()
    
    const rewards = await db
      .select()
      .from(userRewards)
      .where(
        and(
          sql`LOWER(${userRewards.address}) = ${address}`,
          sql`${userRewards.used} = false`,
          or(
            isNull(userRewards.expiresAt),
            gt(userRewards.expiresAt, now)
          )
        )
      )

    const discount = rewards.find(r => r.rewardType === 'discount')
    
    return NextResponse.json({
      hasDiscount: !!discount,
      discountPercent: discount?.discountPercent || 0,
      discountId: discount?.id || null,
      rewards: rewards.map(r => ({
        id: r.id,
        type: r.rewardType,
        discountPercent: r.discountPercent,
        expiresAt: r.expiresAt
      }))
    })
  } catch (error) {
    console.error('Error fetching rewards:', error)
    return NextResponse.json({ hasDiscount: false, rewards: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const walletHeader = request.headers.get('x-wallet')
    const body = await request.json()
    const { address: rawAddress, rewardId } = body

    if (!rawAddress || !rewardId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!walletHeader || walletHeader.toLowerCase() !== rawAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const address = rawAddress.toLowerCase()

    const [reward] = await db
      .select()
      .from(userRewards)
      .where(
        and(
          sql`${userRewards.id} = ${rewardId}`,
          sql`LOWER(${userRewards.address}) = ${address}`,
          sql`${userRewards.used} = false`
        )
      )
      .limit(1)

    if (!reward) {
      return NextResponse.json({ error: 'Reward not found or already used' }, { status: 404 })
    }

    await db.update(userRewards)
      .set({ used: true, usedAt: new Date() })
      .where(sql`${userRewards.id} = ${rewardId}`)

    return NextResponse.json({ 
      success: true,
      discountPercent: reward.discountPercent || 0
    })
  } catch (error) {
    console.error('Error using reward:', error)
    return NextResponse.json({ error: 'Failed to use reward' }, { status: 500 })
  }
}

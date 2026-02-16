import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { events, userRewards, users } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { addEventCredit } from '@/lib/creditManager'
import { normalizeAddress } from '@/lib/addressUtils'

export async function POST(request: NextRequest) {
  try {
    const walletHeader = request.headers.get('x-wallet')
    if (!walletHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const address = normalizeAddress(walletHeader)
    const body = await request.json()
    const { rewardId } = body

    if (!rewardId) {
      return NextResponse.json({ error: 'Missing reward ID' }, { status: 400 })
    }

    const [reward] = await db
      .select()
      .from(userRewards)
      .where(
        and(
          eq(userRewards.id, rewardId),
          sql`LOWER(${userRewards.address}) = ${address}`,
          eq(userRewards.used, false)
        )
      )
      .limit(1)

    if (!reward) {
      return NextResponse.json({ error: 'Voucher not found or already used' }, { status: 404 })
    }

    if (reward.rewardType !== 'free_play') {
      return NextResponse.json({ error: 'This voucher is not a free play' }, { status: 400 })
    }

    const [activeEvent] = await db
      .select()
      .from(events)
      .where(eq(events.frozen, false))
      .orderBy(desc(events.startsAt))
      .limit(1)

    if (!activeEvent) {
      return NextResponse.json({ error: 'No active competition right now' }, { status: 400 })
    }

    await db.insert(users).values({ address }).onConflictDoNothing()

    const creditResult = await addEventCredit(address, activeEvent.id, undefined, 'Free play voucher')

    if (!creditResult.success) {
      if (creditResult.error === 'maxAttemptsReached') {
        return NextResponse.json({ error: 'You have reached the maximum number of plays for this event' }, { status: 400 })
      }
      console.error('Failed to add free play credit:', creditResult.error)
      return NextResponse.json({ error: 'Failed to add credit. Please try again.' }, { status: 500 })
    }

    await db.update(userRewards)
      .set({ used: true, usedAt: new Date() })
      .where(eq(userRewards.id, rewardId))

    return NextResponse.json({
      success: true,
      eventId: activeEvent.id,
      message: 'Free play credited!'
    })
  } catch (error) {
    console.error('Error using free play voucher:', error)
    return NextResponse.json({ error: 'Failed to use voucher' }, { status: 500 })
  }
}

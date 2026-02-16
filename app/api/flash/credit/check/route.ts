import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashCredits, flashEvents, users } from '@/db/schema'
import { eq, and, gte, lte, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 })
    }

    const now = new Date()
    const currentFlash = await db
      .select()
      .from(flashEvents)
      .where(
        and(
          lte(flashEvents.startsAt, now),
          gte(flashEvents.endsAt, now),
          eq(flashEvents.frozen, false)
        )
      )
      .orderBy(desc(flashEvents.id))
      .limit(1)

    if (currentFlash.length === 0) {
      return NextResponse.json({
        hasCredit: false,
        flashEventId: null,
        message: 'No active flash event'
      })
    }

    const flashEvent = currentFlash[0]

    const creditResult = await db
      .select()
      .from(flashCredits)
      .where(
        and(
          eq(flashCredits.address, address),
          eq(flashCredits.flashEventId, flashEvent.id)
        )
      )
      .limit(1)

    const hasCredit = creditResult.length > 0 && creditResult[0].balance > 0 && !creditResult[0].used

    const userResult = await db
      .select({ isVerified: users.isVerified })
      .from(users)
      .where(eq(users.address, address))
      .limit(1)

    const isVerified = userResult.length > 0 ? userResult[0].isVerified : false

    return NextResponse.json({
      hasCredit,
      flashEventId: flashEvent.id,
      balance: creditResult.length > 0 ? creditResult[0].balance : 0,
      used: creditResult.length > 0 ? creditResult[0].used : false,
      isVerified,
      entryFee: isVerified ? 0.5 : 0.75,
      prizePool: parseFloat(flashEvent.prizePoolWld),
    })
  } catch (error) {
    console.error('Error checking flash credit:', error)
    return NextResponse.json({ error: 'Failed to check credit' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashEvents, flashCredits, users } from '@/db/schema'
import { desc, eq, and, gte, lte } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
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
        flashEvent: null,
        message: 'No active flash event'
      })
    }

    const flashEvent = currentFlash[0]
    let hasCredit = false
    let hasPlayed = false
    let isVerified = false

    if (address && address !== 'anonymous') {
      const userResult = await db
        .select({ isVerified: users.isVerified })
        .from(users)
        .where(eq(users.address, address))
        .limit(1)

      if (userResult.length > 0) {
        isVerified = userResult[0].isVerified
      }

      const creditRecords = await db
        .select()
        .from(flashCredits)
        .where(
          and(
            eq(flashCredits.address, address),
            eq(flashCredits.flashEventId, flashEvent.id)
          )
        )
        .orderBy(desc(flashCredits.updatedAt))

      if (creditRecords.length > 0) {
        let totalBalance = 0
        let anyUsed = false
        for (const credit of creditRecords) {
          totalBalance += credit.balance
          if (credit.used || credit.balance === 0) {
            anyUsed = true
          }
        }
        hasCredit = totalBalance > 0
        hasPlayed = anyUsed && totalBalance === 0
      }
    }

    return NextResponse.json({
      flashEvent: {
        id: flashEvent.id,
        startsAt: flashEvent.startsAt.toISOString(),
        endsAt: flashEvent.endsAt.toISOString(),
        prizePool: parseFloat(flashEvent.prizePoolWld),
      },
      hasCredit,
      hasPlayed,
      isVerified,
      entryFee: isVerified ? 0.5 : 0.75,
    })
  } catch (error) {
    console.error('Error fetching flash event:', error)
    return NextResponse.json({ error: 'Failed to fetch flash event' }, { status: 500 })
  }
}

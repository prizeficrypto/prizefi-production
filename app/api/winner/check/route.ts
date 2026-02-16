import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { events, eventWinners } from '@/db/schema'
import { desc, eq, and, lt } from 'drizzle-orm'
import { ethers } from 'ethers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address) {
    return NextResponse.json({ isWinner: false })
  }

  try {
    const now = new Date()
    
    const endedEvents = await db
      .select({
        eventId: events.id,
        endsAt: events.endsAt,
      })
      .from(events)
      .where(
        and(
          lt(events.endsAt, now),
          eq(events.frozen, true)
        )
      )
      .orderBy(desc(events.endsAt))
      .limit(5)

    for (const event of endedEvents) {
      const winnerData = await db
        .select()
        .from(eventWinners)
        .where(eq(eventWinners.eventId, event.eventId))
        .limit(1)

      if (winnerData.length === 0) continue

      const winners = JSON.parse(winnerData[0].winnersData) as Array<{
        address: string
        amount: string
      }>

      const userWinner = winners.find(
        (w) => w.address.toLowerCase() === address.toLowerCase()
      )

      if (userWinner) {
        const rank = winners.findIndex(
          (w) => w.address.toLowerCase() === address.toLowerCase()
        ) + 1

        const prizeAmount = ethers.formatEther(userWinner.amount)

        return NextResponse.json({
          isWinner: true,
          eventId: event.eventId,
          rank,
          prizeAmount,
          eventEndedAt: event.endsAt.toISOString(),
        })
      }
    }

    return NextResponse.json({ isWinner: false })
  } catch (error) {
    console.error('Error checking winner status:', error)
    return NextResponse.json({ isWinner: false })
  }
}

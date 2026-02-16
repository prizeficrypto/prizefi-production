import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../db'
import { events } from '../../../../db/schema'
import { desc, lt } from 'drizzle-orm'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger } from '@/lib/security/logger'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 5

    const now = new Date()

    const pastEvents = await db
      .select({
        id: events.id,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        frozen: events.frozen,
        prizePoolWld: events.prizePoolWld,
      })
      .from(events)
      .where(lt(events.endsAt, now))
      .orderBy(desc(events.endsAt))
      .limit(limit)

    logger.info('Past events fetched', { count: pastEvents.length })

    return addCorsHeaders(NextResponse.json({
      events: pastEvents.map((event, index) => ({
        id: event.id,
        roundNumber: pastEvents.length - index,
        startedAt: event.startsAt.toISOString(),
        endedAt: event.endsAt.toISOString(),
        finalized: event.frozen,
        prizePoolWld: event.prizePoolWld ? parseFloat(event.prizePoolWld) : 100,
      })),
    }))
  } catch (error) {
    logger.error('Error fetching past events', { error: String(error) })
    return addCorsHeaders(NextResponse.json(
      { error: 'server_error', message: 'Failed to fetch past events' },
      { status: 500 }
    ))
  }
}

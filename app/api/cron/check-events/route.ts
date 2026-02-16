import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../db'
import { events } from '../../../../db/schema'
import { sql } from 'drizzle-orm'
import { createLogger } from '../../../../lib/logger'
import { validateAdminKey, createAdminErrorResponse } from '@/lib/security/auth'
import { createServerError } from '@/lib/security/validation'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'

export async function OPTIONS() {
  return createOptionsResponse('admin')
}

export async function GET(request: NextRequest) {
  const logger = createLogger('/api/cron/check-events', 'GET')
  
  try {
    if (!validateAdminKey(request)) {
      logger.warn('Unauthorized cron access attempt')
      return createAdminErrorResponse()
    }

    logger.info('Running event rollover check')
    
    const [currentEvent] = await db
      .select()
      .from(events)
      .orderBy(sql`${events.createdAt} DESC`)
      .limit(1)

    if (!currentEvent) {
      logger.warn('No events found in database')
      return addCorsHeaders(NextResponse.json({
        status: 'warning',
        message: 'No events in database',
      }))
    }

    const now = new Date()
    const eventEnded = now > currentEvent.endsAt
    const cooldownOver = currentEvent.frozen && 
      now.getTime() - currentEvent.endsAt.getTime() > 3600000

    logger.info('Event status check', {
      eventId: currentEvent.id,
      frozen: currentEvent.frozen,
      ended: eventEnded,
      cooldownOver,
      endsAt: currentEvent.endsAt.toISOString(),
    })

    if (eventEnded && !currentEvent.frozen) {
      logger.warn('Event ended but not frozen', {
        eventId: currentEvent.id,
        endsAt: currentEvent.endsAt.toISOString(),
      })
    }

    if (cooldownOver) {
      logger.info('Cooldown period over, new event should be created')
    }

    return addCorsHeaders(NextResponse.json({
      status: 'ok',
      currentEvent: {
        id: currentEvent.id,
        frozen: currentEvent.frozen,
        endsAt: currentEvent.endsAt.toISOString(),
      },
      checks: {
        eventEnded,
        eventFrozen: currentEvent.frozen,
        cooldownOver,
      },
    }))
  } catch (error) {
    logger.error('Event check failed', error)
    return createServerError()
  }
}

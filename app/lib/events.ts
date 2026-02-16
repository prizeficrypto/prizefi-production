import { db } from '../../db'
import { events } from '../../db/schema'
import { desc, eq, and, lte, gte } from 'drizzle-orm'

export async function getCurrentEvent() {
  const now = new Date()
  
  const [currentEvent] = await db
    .select()
    .from(events)
    .where(and(
      eq(events.frozen, false)
    ))
    .orderBy(desc(events.startsAt))
    .limit(1)
  
  if (currentEvent && now >= currentEvent.startsAt && now < currentEvent.endsAt) {
    return currentEvent
  }
  
  if (currentEvent && now >= currentEvent.endsAt) {
    const oneHourAfterEnd = new Date(currentEvent.endsAt.getTime() + 60 * 60 * 1000)
    
    if (now < oneHourAfterEnd) {
      return {
        ...currentEvent,
        status: 'ended' as const,
        timeUntilNext: oneHourAfterEnd.getTime() - now.getTime()
      }
    }
  }
  
  const newEvent = await createNewEvent()
  return newEvent
}

export async function createNewEvent() {
  const now = new Date()
  const startsAt = now
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  
  const [event] = await db
    .insert(events)
    .values({
      startsAt,
      endsAt,
      frozen: false,
    })
    .returning()
  
  return event
}

export async function getEventTimeRemaining(eventId: number) {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)
  
  if (!event) return null
  
  const now = new Date()
  const timeRemaining = event.endsAt.getTime() - now.getTime()
  
  if (timeRemaining <= 0) {
    const oneHourAfterEnd = new Date(event.endsAt.getTime() + 60 * 60 * 1000)
    const timeUntilNext = oneHourAfterEnd.getTime() - now.getTime()
    
    return {
      status: 'ended' as const,
      timeRemaining: 0,
      timeUntilNext: Math.max(0, timeUntilNext)
    }
  }
  
  return {
    status: 'active' as const,
    timeRemaining,
    timeUntilNext: null
  }
}

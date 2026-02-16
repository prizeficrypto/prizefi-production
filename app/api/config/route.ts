import { NextResponse } from 'next/server'
import { db } from '@/db'
import { appConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getCached, setCache } from '@/lib/cache'

export async function GET() {
  try {
    // Check cache first (30 second TTL - config rarely changes)
    const cacheKey = 'app-config-global'
    const cached = getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }
    
    // Get config from shared pool
    const configs = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.id, 'global'))
      .limit(1)

    let responseData
    if (configs.length === 0) {
      // Return default config
      responseData = {
        prizePoolWld: 100,
        eventDurationSec: 7 * 24 * 60 * 60,
        version: 1,
      }
    } else {
      const config = configs[0]
      responseData = {
        prizePoolWld: parseFloat(config.prizePoolWld),
        eventDurationSec: config.eventDurationSec,
        version: config.version,
      }
    }
    
    // Cache for 30 seconds
    setCache(cacheKey, responseData, 30000)

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Get public config error:', error)
    return NextResponse.json(
      { error: 'Failed to get config' },
      { status: 500 }
    )
  }
}

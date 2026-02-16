import { NextResponse } from 'next/server'
import { db } from '../../../db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../../../lib/logger'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET() {
  const logger = createLogger('/api/health', 'GET')
  
  try {
    logger.info('Health check requested')
    await db.execute(sql`SELECT 1`)
    
    logger.success('Health check passed')
    
    return addCorsHeaders(NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NEXT_PUBLIC_ENV || 'development',
    }))
  } catch (error) {
    logger.error('Health check failed', error)
    return addCorsHeaders(NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: 'Database connection failed',
      },
      { status: 503 }
    ))
  }
}

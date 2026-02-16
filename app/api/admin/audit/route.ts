import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { auditLogs, adminSessions } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

async function verifyAdminSession(sessionToken: string | null): Promise<boolean> {
  if (!sessionToken) return false

  const sessions = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.sessionToken, sessionToken))
    .limit(1)

  if (sessions.length === 0) return false

  const session = sessions[0]
  if (new Date() > session.expiresAt) return false
  
  // CRITICAL: Require MFA verification before showing audit logs
  if (!session.mfaVerified) return false

  return true
}

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.headers.get('x-admin-session')

    // Verify admin session
    if (!await verifyAdminSession(sessionToken)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Get audit logs
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({
      logs,
      page,
      limit,
    })
  } catch (error) {
    console.error('Get audit logs error:', error)
    return NextResponse.json(
      { error: 'Failed to get audit logs' },
      { status: 500 }
    )
  }
}

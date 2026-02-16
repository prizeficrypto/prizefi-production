import { NextRequest } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { appConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial config
      try {
        const configs = await db
          .select()
          .from(appConfig)
          .where(eq(appConfig.id, 'global'))
          .limit(1)

        const config = configs.length > 0 ? configs[0] : {
          prizePoolWld: '100',
          eventDurationSec: 7 * 24 * 60 * 60,
          version: 1,
        }

        const data = {
          version: config.version,
          prizePoolWld: parseFloat(config.prizePoolWld.toString()),
          eventDurationSec: config.eventDurationSec,
        }

        controller.enqueue(encoder.encode(`event: config\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      } catch (error) {
        console.error('SSE initial send error:', error)
      }

      // Keep connection alive with heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch (error) {
          clearInterval(heartbeatInterval)
        }
      }, 30000)

      // Poll for config changes every 5 seconds
      let lastVersion = 1
      const pollInterval = setInterval(async () => {
        try {
          const configs = await db
            .select()
            .from(appConfig)
            .where(eq(appConfig.id, 'global'))
            .limit(1)

          if (configs.length > 0 && configs[0].version > lastVersion) {
            const config = configs[0]
            lastVersion = config.version

            const data = {
              version: config.version,
              prizePoolWld: parseFloat(config.prizePoolWld.toString()),
              eventDurationSec: config.eventDurationSec,
            }

            controller.enqueue(encoder.encode(`event: config\n`))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          }
        } catch (error) {
          console.error('SSE poll error:', error)
        }
      }, 5000)

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval)
        clearInterval(pollInterval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

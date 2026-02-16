import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { walletAddress, username } = body

    if (!walletAddress || !username) {
      return addCorsHeaders(NextResponse.json(
        { error: 'walletAddress and username required' },
        { status: 400 }
      ))
    }

    const headerWallet = req.headers.get('x-wallet')?.toLowerCase()
    const address = walletAddress.toLowerCase()

    if (!headerWallet || headerWallet !== address) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Wallet address mismatch - authentication required' },
        { status: 401 }
      ))
    }
    const trimmedUsername = username.trim()

    if (trimmedUsername.length < 1 || trimmedUsername.length > 100) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Invalid username length' },
        { status: 400 }
      ))
    }

    const usernameLower = trimmedUsername.toLowerCase()

    const RESERVED_USERNAMES = [
      'admin', 'administrator', 'mod', 'moderator', 'system', 'prizefi', 
      'prize-fi', 'support', 'help', 'official', 'world', 'worldcoin',
      'worldapp', 'wld', 'null', 'undefined', 'root', 'api', 'www',
      'bot', 'robot', 'test', 'demo', 'dev', 'staff', 'team', 'owner'
    ]

    if (RESERVED_USERNAMES.includes(usernameLower)) {
      return addCorsHeaders(NextResponse.json(
        { error: 'This username is reserved' },
        { status: 400 }
      ))
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1)

    if (existingUser) {
      await db
        .update(users)
        .set({
          worldAppUsername: trimmedUsername,
          username: existingUser.username || trimmedUsername,
          usernameLower: existingUser.usernameLower || usernameLower,
        })
        .where(eq(users.address, address))
      
      return addCorsHeaders(NextResponse.json({
        success: true,
        username: trimmedUsername,
        worldAppUsername: trimmedUsername,
      }))
    }

    const [usernameConflict] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.usernameLower, usernameLower),
          sql`${users.address} != ${address}`
        )
      )
      .limit(1)

    if (usernameConflict) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Username already taken' },
        { status: 409 }
      ))
    }

    await db
      .insert(users)
      .values({
        address,
        username: trimmedUsername,
        usernameLower,
        worldAppUsername: trimmedUsername,
        isVerified: false,
      })
      .onConflictDoNothing()

    return addCorsHeaders(NextResponse.json({
      success: true,
      username: trimmedUsername,
      worldAppUsername: trimmedUsername,
    }))
  } catch (error) {
    console.error('Error storing World App username:', error)
    return createServerError()
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(req: NextRequest) {
  try {
    const nonce = crypto.randomBytes(16).toString('hex')
    
    const cookieStore = await cookies()
    cookieStore.set('siwe_nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 5,
      path: '/',
    })

    return addCorsHeaders(NextResponse.json({ nonce }))
  } catch (error) {
    console.error('Error generating nonce:', error)
    return addCorsHeaders(NextResponse.json(
      { error: 'Failed to generate nonce' },
      { status: 500 }
    ))
  }
}

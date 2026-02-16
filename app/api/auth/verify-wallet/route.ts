import { NextRequest, NextResponse } from 'next/server'
import { verifySiweMessage, MiniAppWalletAuthSuccessPayload } from '@worldcoin/minikit-js'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { cookies } from 'next/headers'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

interface VerifyRequest {
  payload: MiniAppWalletAuthSuccessPayload
  nonce: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as VerifyRequest
    const { payload, nonce } = body

    if (!payload || !nonce) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Missing payload or nonce' },
        { status: 400 }
      ))
    }

    const cookieStore = await cookies()
    const storedNonce = cookieStore.get('siwe_nonce')?.value

    if (!storedNonce || storedNonce !== nonce) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Invalid or expired nonce', isValid: false },
        { status: 401 }
      ))
    }

    try {
      const result = await verifySiweMessage(payload, nonce)

      if (result.isValid) {
        cookieStore.delete('siwe_nonce')

        return addCorsHeaders(NextResponse.json({
          isValid: true,
          address: payload.address?.toLowerCase(),
        }))
      } else {
        return addCorsHeaders(NextResponse.json({
          isValid: false,
          error: 'Signature verification failed',
        }))
      }
    } catch (verifyError: any) {
      console.error('SIWE verification error:', verifyError)
      return addCorsHeaders(NextResponse.json({
        isValid: false,
        error: verifyError.message || 'Verification failed',
      }))
    }
  } catch (error) {
    console.error('Error verifying wallet:', error)
    return addCorsHeaders(NextResponse.json(
      { error: 'Server error during verification', isValid: false },
      { status: 500 }
    ))
  }
}

import { randomBytes } from 'crypto'
import { authenticator } from 'otplib'

export const AUTHORIZED_ADMIN_EMAIL = process.env.AUTHORIZED_ADMIN_EMAIL || 'prizeficrypto@gmail.com'

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function generateTOTPSecret(): string {
  return authenticator.generateSecret()
}

export function verifyTOTP(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret })
  } catch (error) {
    console.error('TOTP verification error:', error)
    return false
  }
}

export function getTOTPUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, 'PrizeFi Admin', secret)
}

export function isAuthorizedEmail(email: string): boolean {
  return email === AUTHORIZED_ADMIN_EMAIL
}

export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.headers.get('x-real-ip') || 'unknown'
}

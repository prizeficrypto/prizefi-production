'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './admin.module.css'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpToken, setTotpToken] = useState('')
  const [sessionToken, setSessionToken] = useState('')
  const [qrCodeURL, setQrCodeURL] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'login' | 'setup-mfa' | 'verify-mfa'>('login')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      setSessionToken(data.sessionToken)

      if (data.mfaSetup) {
        setStep('verify-mfa')
      } else {
        const setupRes = await fetch('/api/admin/setup-mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: data.sessionToken }),
        })

        const setupData = await setupRes.json()

        if (setupRes.ok) {
          setQrCodeURL(setupData.qrCodeURL)
          setStep('setup-mfa')
        } else {
          setError(setupData.error || 'MFA setup failed')
        }
      }
    } catch (err) {
      setError('Login failed. Please try again.')
    }
  }

  const handleVerifyMFA = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const res = await fetch('/api/admin/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken, totpToken }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'MFA verification failed')
        return
      }

      localStorage.setItem('adminSessionToken', sessionToken)
      router.push('/admin/config')
    } catch (err) {
      setError('MFA verification failed. Please try again.')
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.subtitle}>PrizeFi Management</p>

        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                placeholder="admin@prizefi.com"
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            <button type="submit" className={styles.button}>
              Sign In
            </button>
          </form>
        )}

        {step === 'setup-mfa' && (
          <div className={styles.mfaSetup}>
            <h2 className={styles.mfaTitle}>Set Up 2FA</h2>
            <p className={styles.mfaText}>
              Scan with your authenticator app
            </p>
            <div className={styles.qrContainer}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCodeURL)}`}
                alt="QR Code"
                className={styles.qrCode}
              />
            </div>
            <form onSubmit={handleVerifyMFA} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>6-digit code</label>
                <input
                  type="text"
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={styles.codeInput}
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>
              <button type="submit" className={styles.button}>
                Verify
              </button>
            </form>
          </div>
        )}

        {step === 'verify-mfa' && (
          <form onSubmit={handleVerifyMFA} className={styles.form}>
            <h2 className={styles.mfaTitle}>Two-Factor Auth</h2>
            <p className={styles.mfaText}>Enter your authenticator code</p>
            <div className={styles.field}>
              <input
                type="text"
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={styles.codeInput}
                placeholder="000000"
                maxLength={6}
                required
              />
            </div>
            <button type="submit" className={styles.button}>
              Continue
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

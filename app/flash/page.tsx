'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useSession } from '../contexts/SessionContext'
import { useLanguage } from '../contexts/LanguageContext'
import { startSessionReal, getWalletAddressOnly, payEntry } from '../lib/minikit'
import { generateCryptoSeed } from '../../lib/cryptoSeed'
import styles from './flash.module.css'

const PrecisionTapGame = dynamic(() => import('../components/PrecisionTapGame'), { ssr: false })

export default function FlashPage() {
  const router = useRouter()
  const { session, setSession } = useSession()
  const { t } = useLanguage()
  const [connecting, setConnecting] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [startingGame, setStartingGame] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'finished'>('idle')
  const [gameScore, setGameScore] = useState(0)
  const [gameSeed, setGameSeed] = useState('')
  const [gameInputLog, setGameInputLog] = useState<any[]>([])
  const [gameStartToken, setGameStartToken] = useState('')
  const [gameStartedAt, setGameStartedAt] = useState(0)
  const [flashEventId, setFlashEventId] = useState<number | null>(null)
  const [flashData, setFlashData] = useState<any>(null)
  const [flashStatusLoaded, setFlashStatusLoaded] = useState(false)
  const [flashCredits, setFlashCredits] = useState(0)
  const [creditUsed, setCreditUsed] = useState(false)
  const [prizePool, setPrizePool] = useState<number>(0)
  const [entryFee, setEntryFee] = useState<number>(0.5)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedName = localStorage.getItem('prizefi_username')
    if (savedName) setUsername(savedName)
  }, [])

  useEffect(() => {
    fetchFlashStatus()
    const interval = setInterval(fetchFlashStatus, 10000)
    return () => clearInterval(interval)
  }, [session])

  const fetchFlashStatus = async () => {
    try {
      const address = session?.address || 'anonymous'
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch(`/api/flash/current?address=${address}`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      })
      clearTimeout(timeoutId)
      
      if (!response.ok) throw new Error('Failed to fetch flash status')
      
      const data = await response.json()
      setFlashData(data)
      setFlashStatusLoaded(true)
      
      if (data.flashEvent) {
        setFlashEventId(data.flashEvent.id)
        setPrizePool(data.flashEvent.prizePool || 0)
        setFlashCredits(data.hasCredit ? 1 : 0)
        setCreditUsed(data.hasPlayed || false)
        setEntryFee(data.entryFee || 0.5)
      } else {
        setFlashEventId(null)
        setPrizePool(0)
        setFlashCredits(0)
        setCreditUsed(false)
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Flash status error:', err)
      }
    }
  }

  const handleConnect = async () => {
    setError(null)
    setConnecting(true)
    try {
      const result = await startSessionReal()
      if (result && result.address) {
        setSession(result)
        fetchFlashStatus()
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleBuyEntry = async () => {
    if (!session?.address || !flashEventId) return
    
    setError(null)
    setPurchasing(true)
    
    try {
      const intentRes = await fetch('/api/flash/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: session.address })
      })
      
      if (!intentRes.ok) {
        const data = await intentRes.json()
        throw new Error(data.error || 'Failed to create payment')
      }
      
      const intentData = await intentRes.json()
      const paymentResult = await payEntry(intentData.intentId, intentData.entryFeeWld)
      
      if (paymentResult.success) {
        await fetch('/api/flash/payment/confirm', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-wallet': session.address
          },
          body: JSON.stringify({
            intentId: intentData.intentId,
            transactionId: paymentResult.transactionId
          })
        })
        
        await fetchFlashStatus()
      } else {
        throw new Error('Payment cancelled or failed')
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed')
    } finally {
      setPurchasing(false)
    }
  }

  const handleStartGame = async () => {
    if (!session?.address || !flashEventId) return
    if (flashCredits <= 0 || creditUsed) return
    
    setError(null)
    setStartingGame(true)
    
    try {
      const response = await fetch('/api/flash/run/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: session.address,
          flashEventId 
        })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to start game')
      }
      
      const data = await response.json()
      setGameSeed(data.seed)
      setGameStartToken(data.startToken)
      setGameStartedAt(data.startedAt)
      setGameState('playing')
    } catch (err: any) {
      setError(err.message || 'Failed to start game')
    } finally {
      setStartingGame(false)
    }
  }

  const handleGameComplete = async (score: number, taps: number[], inputLog: any[]) => {
    setGameScore(score)
    setGameInputLog(inputLog)
    setGameState('finished')
  }

  const handleSubmitScore = async () => {
    if (!session?.address || !flashEventId) return
    
    setSubmitting(true)
    try {
      const response = await fetch('/api/flash/run/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: session.address,
          flashEventId,
          seed: gameSeed,
          startToken: gameStartToken,
          startedAt: gameStartedAt,
          score: gameScore,
          inputLog: gameInputLog,
          username: username || undefined
        })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit score')
      }
      
      await fetchFlashStatus()
      setGameState('idle')
    } catch (err: any) {
      setError(err.message || 'Failed to submit score')
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs}h ${mins}m`
    }
    return `${mins}m ${secs}s`
  }

  const secondsLeft = flashData?.secondsLeft || 0

  if (gameState === 'playing') {
    return (
      <PrecisionTapGame
        seed={gameSeed}
        onGameOver={(score, seed, taps, inputLog) => handleGameComplete(score, taps, inputLog)}
      />
    )
  }

  if (gameState === 'finished') {
    return (
      <main className={styles.container}>
        <div className={styles.resultScreen}>
          <h1 className={styles.resultTitle}>Game Complete!</h1>
          <div className={styles.scoreDisplay}>
            <span className={styles.scoreLabel}>Your Score</span>
            <span className={styles.scoreValue}>{gameScore}</span>
          </div>
          <button 
            onClick={handleSubmitScore} 
            disabled={submitting}
            className={styles.primaryButton}
          >
            {submitting ? 'Submitting...' : 'Submit Score'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.container}>
      <TopBar title="Flash Round" />
      
      <div className={styles.content}>
        <div className={styles.flashHeader}>
          <div className={styles.flashBadge}>FLASH</div>
          <h1 className={styles.title}>Flash Round</h1>
          <p className={styles.subtitle}>Quick tournaments with instant prizes!</p>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            {error}
            <button onClick={() => setError(null)} className={styles.dismissError}>x</button>
          </div>
        )}

        {!flashStatusLoaded ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Loading...</p>
          </div>
        ) : !flashEventId ? (
          <div className={styles.noEvent}>
            <div className={styles.noEventIcon}>⚡</div>
            <h2>No Flash Round Active</h2>
            <p>Check back soon for the next Flash round!</p>
            <button onClick={() => router.push('/')} className={styles.backButton}>
              Back to Main Tournament
            </button>
          </div>
        ) : (
          <>
            <div className={styles.eventCard}>
              <div className={styles.eventRow}>
                <span className={styles.eventLabel}>Prize Pool</span>
                <span className={styles.eventValue}>{prizePool} WLD</span>
              </div>
              <div className={styles.eventRow}>
                <span className={styles.eventLabel}>Time Left</span>
                <span className={styles.eventValue}>{formatTime(secondsLeft)}</span>
              </div>
              <div className={styles.eventRow}>
                <span className={styles.eventLabel}>Entry Fee</span>
                <span className={styles.eventValue}>{entryFee} WLD</span>
              </div>
            </div>

            {!session?.address ? (
              <button 
                onClick={handleConnect} 
                disabled={connecting}
                className={styles.primaryButton}
              >
                {connecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            ) : (
              <div className={styles.actionSection}>
                <div className={styles.statusRow}>
                  <span>Your Credits:</span>
                  <span className={styles.creditCount}>{flashCredits}</span>
                </div>
                
                {creditUsed ? (
                  <div className={styles.usedNotice}>
                    <p>You have already played in this Flash round.</p>
                    <button onClick={() => router.push('/flash/leaderboard')} className={styles.secondaryButton}>
                      View Leaderboard
                    </button>
                  </div>
                ) : flashCredits > 0 ? (
                  <button 
                    onClick={handleStartGame} 
                    disabled={startingGame}
                    className={styles.primaryButton}
                  >
                    {startingGame ? 'Starting...' : 'Play Now'}
                  </button>
                ) : (
                  <button 
                    onClick={handleBuyEntry} 
                    disabled={purchasing}
                    className={styles.primaryButton}
                  >
                    {purchasing ? 'Processing...' : `Buy Entry (${entryFee} WLD)`}
                  </button>
                )}
              </div>
            )}

            <button onClick={() => router.push('/flash/leaderboard')} className={styles.leaderboardLink}>
              View Flash Leaderboard
            </button>

            <button onClick={() => router.push('/')} className={styles.backLink}>
              Back to Main Tournament
            </button>
          </>
        )}
      </div>

      <BottomNav />
    </main>
  )
}

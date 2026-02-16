'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../contexts/LanguageContext'
import { useSession } from '../contexts/SessionContext'
import { isWorldAppMiniApp } from '../lib/minikit'
import styles from './GameResult.module.css'

// Prize distribution as percentages of the prize pool
const PRIZE_PERCENTAGES: Record<number, number> = {
  1: 25.00,
  2: 15.00,
  3: 12.00,
  4: 10.00,
  5: 8.00,
  6: 7.00,
  7: 6.00,
  8: 5.00,
  9: 4.00,
  10: 3.00,
}

function getPotentialPrize(rank: number, prizePool: number): number {
  if (rank >= 1 && rank <= 10) {
    return (prizePool * PRIZE_PERCENTAGES[rank]) / 100
  }
  return 0
}

interface GameResultProps {
  score: number
  seed: string
  taps: number[]
  inputLog: any[]
  eventId: number
  startToken: string
  startedAt: number
  onBackToHome: () => void
  onScoreSubmitted?: () => void
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

export default function GameResult({ 
  score, 
  seed, 
  taps, 
  inputLog, 
  eventId, 
  startToken,
  startedAt,
  onBackToHome,
  onScoreSubmitted
}: GameResultProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const { session } = useSession()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [currentRank, setCurrentRank] = useState<number | null>(null)
  const [potentialPrize, setPotentialPrize] = useState<number>(0)
  const [previousRank, setPreviousRank] = useState<number | null>(null)
  const [rankMovement, setRankMovement] = useState<number>(0)
  const [totalPlayers, setTotalPlayers] = useState<number>(0)
  const [top10Threshold, setTop10Threshold] = useState<number | null>(null)
  const [firstPlaceScore, setFirstPlaceScore] = useState<number>(0)
  const hasAttemptedSubmit = useRef(false)

  async function fetchUserRank() {
    if (!session?.address || !eventId) return
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(`/api/leaderboard?eventId=${eventId}`, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (response.ok) {
        const data = await response.json()
        const prizePool = data.prizePool || 100
        const userEntry = data.leaderboard?.find(
          (entry: any) => entry.address?.toLowerCase() === session.address?.toLowerCase()
        )
        if (userEntry?.rank) {
          setCurrentRank(userEntry.rank)
          setPotentialPrize(getPotentialPrize(userEntry.rank, prizePool))
        }
        if (data.totalPlayers) setTotalPlayers(data.totalPlayers)
        if (data.top10ThresholdScore != null) setTop10Threshold(data.top10ThresholdScore)
      }
    } catch (err) {
      console.error('Failed to fetch rank:', err)
    }
  }

  useEffect(() => {
    if (!hasAttemptedSubmit.current) {
      hasAttemptedSubmit.current = true
      submitScore(false)
    }
  }, [])

  async function submitScore(isRetry = false) {
    if (submitting) {
      return
    }

    if (!session?.address) {
      console.error('❌ No wallet address in session')
      setError('noWalletAddress')
      setErrorDetails('Please connect your wallet and try again')
      return
    }
    
    if (!eventId) {
      console.error('❌ No event ID')
      setError('noEventId')
      setErrorDetails('Event ID is missing')
      return
    }
    
    if (!startToken) {
      console.error('❌ No start token')
      setError('noStartToken')
      setErrorDetails('Game session token is missing')
      return
    }

    setSubmitting(true)
    setError(null)
    setErrorDetails(null)
    
    try {
      console.log('📤 Submitting score to COMPETITION leaderboard:', { 
        address: session.address, 
        eventId, 
        score,
        inputLogLength: inputLog?.length || 0,
        startToken: startToken.substring(0, 20) + '...',
        retryAttempt: retryCount
      });
      
      const finishResponse = await fetch('/api/run/finish', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-world-app': isWorldAppMiniApp() ? 'true' : 'false',
          'x-wallet': session.address
        },
        body: JSON.stringify({
          address: session.address,
          isVerified: session.isVerified,
          eventId,
          score,
          seed,
          inputLog,
          startToken,
          startedAt,
        }),
      })

      const data = await finishResponse.json()

      if (finishResponse.ok) {
        console.log('✅ Score submitted successfully to COMPETITION leaderboard!', data);
        setSubmitted(true)
        setError(null)
        if (data.previousRank != null) setPreviousRank(data.previousRank)
        if (data.newRank != null) {
          setCurrentRank(data.newRank)
          const prizePool = 100
          setPotentialPrize(getPotentialPrize(data.newRank, prizePool))
        }
        if (data.totalPlayers) setTotalPlayers(data.totalPlayers)
        if (data.top10ThresholdScore != null) setTop10Threshold(data.top10ThresholdScore)
        if (data.firstPlaceScore) setFirstPlaceScore(data.firstPlaceScore)
        if (data.previousRank != null && data.newRank != null && data.newRank < data.previousRank) {
          setRankMovement(data.previousRank - data.newRank)
        }
        await fetchUserRank()
        if (onScoreSubmitted) {
          onScoreSubmitted()
        }
      } else {
        console.error('❌ Failed to submit to COMPETITION leaderboard:', {
          status: finishResponse.status,
          data,
          inputLogLength: inputLog?.length,
          score
        });
        
        const errorMsg = data.error || 'submitFailed'
        const details = data.message || data.details || JSON.stringify(data)
        
        if (data.serverScore !== undefined && data.clientScore !== undefined) {
          setErrorDetails(`Server calculated score: ${data.serverScore}, your score: ${data.clientScore}`)
        } else {
          setErrorDetails(details)
        }
        
        setError(errorMsg)
        
        if (retryCount < MAX_RETRIES && !['duplicate_run', 'invalid_token', 'max_tries_exceeded'].includes(errorMsg)) {
          console.log(`🔄 Will retry in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
          setTimeout(() => {
            setRetryCount(prev => prev + 1)
            submitScore(true)
          }, RETRY_DELAY_MS)
        }
      }
    } catch (err) {
      console.error('💥 Network error submitting score:', err);
      setError('networkError')
      setErrorDetails(err instanceof Error ? err.message : 'Network request failed')
      
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 Will retry in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          submitScore(true)
        }, RETRY_DELAY_MS)
      }
    } finally {
      setSubmitting(false)
    }
  }
  
  function handleManualRetry() {
    setRetryCount(0)
    hasAttemptedSubmit.current = false
    submitScore(true)
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('gameOver')}</h1>
        
        <div className={styles.scoreDisplay}>
          <div className={styles.scoreLabel}>{t('finalScore')}</div>
          <div className={styles.scoreValue}>{score}</div>
          <div className={styles.scoreSubtext}>{t('pipesCleared')}</div>
        </div>

        {submitted && totalPlayers > 1 && currentRank !== null && (
          <div className={styles.percentileMsg}>
            You placed higher than {Math.max(0, Math.round(((totalPlayers - currentRank) / totalPlayers) * 100))}% of players!
          </div>
        )}

        {submitted && rankMovement > 0 && currentRank !== null && (
          <div className={styles.rankMovementCard}>
            <div className={styles.rankMovementText}>
              Congratulations! You just moved up {rankMovement} spot{rankMovement > 1 ? 's' : ''}, giving you the current ranking of #{currentRank}!
            </div>
          </div>
        )}

        {submitted && currentRank !== null && (
          potentialPrize > 0 ? (
            <div className={styles.rankCard}>
              <div className={styles.rankLabel}>Current Rank</div>
              <div className={styles.rankValue}>#{currentRank}</div>
              <div className={styles.prizeBox}>
                <div className={styles.prizeLabel}>Potential Prize</div>
                <div className={styles.prizeValue}>{potentialPrize} WLD</div>
                <div className={styles.prizeHint}>Keep this rank until event ends to win!</div>
              </div>
            </div>
          ) : (
            <div className={styles.noRankCard}>
              <div className={styles.rankLabel} style={{ color: 'var(--color-muted)' }}>Current Rank</div>
              <div className={styles.rankValue} style={{ color: 'var(--color-text)' }}>#{currentRank}</div>
              {top10Threshold !== null && currentRank > 10 && score < top10Threshold ? (
                <div className={styles.pointsAwayText}>
                  You're {top10Threshold - score} point{top10Threshold - score !== 1 ? 's' : ''} away from placing in the top 10 and winning a $WLD prize!
                </div>
              ) : (
                <div className={styles.noRankText}>Top 10 win prizes. Keep playing to climb!</div>
              )}
            </div>
          )
        )}

        <div className={styles.status}>
          {submitting && (
            <p>
              {t('submittingScore')}
              {retryCount > 0 && ` (retry ${retryCount}/${MAX_RETRIES})`}
            </p>
          )}
          {submitted && <p className={styles.success}>{t('scoreSubmitted')}</p>}
          {error && !submitting && (
            <div>
              <p className={styles.error}>{t(error as any) || error}</p>
              {errorDetails && (
                <p className={styles.errorDetails}>{errorDetails}</p>
              )}
              {retryCount >= MAX_RETRIES && (
                <button onClick={handleManualRetry} className={styles.retryBtn}>
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>

        {submitted && (
          <button 
            onClick={() => router.push('/leaderboard?tab=competition')} 
            className={styles.leaderboardBtn}
          >
            🏆 View Competition Leaderboard
          </button>
        )}

        <button onClick={onBackToHome} className={styles.homeBtn}>
          {t('backToHome')}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { getDemoPlayerId, formatDemoPlayerName } from '../lib/demoPlayer'
import styles from './DemoResult.module.css'

interface DemoResultProps {
  score: number
  onBackToHome: () => void
  onBuyEntry: () => Promise<void>
  walletAddress?: string
  isVerified?: boolean
}

interface LeaderboardEntry {
  rank: number
  playerName: string
  score: number
  submittedAt: string
}

export default function DemoResult({ score, onBackToHome, onBuyEntry, walletAddress, isVerified = false }: DemoResultProps) {
  const { t } = useLanguage()
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)
  const hasSubmitted = useRef(false)
  
  // Generate unique player ID - use wallet address if available for consistency
  const playerId = getDemoPlayerId(walletAddress)
  const playerName = formatDemoPlayerName(playerId, walletAddress)
  
  console.log('📊 DemoResult initialized:', { walletAddress, playerId, playerName, isVerified })

  useEffect(() => {
    fetchLeaderboard()
    
    if (!hasSubmitted.current) {
      hasSubmitted.current = true
      handleAutoSubmit()
    }
  }, [])

  const fetchLeaderboard = async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      const response = await fetch('/api/demo/leaderboard?limit=10', { signal: controller.signal })
      clearTimeout(timeoutId)
      const data = await response.json()
      if (data.leaderboard) {
        setLeaderboard(data.leaderboard)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('Leaderboard fetch timed out')
      } else {
        console.error('Failed to fetch leaderboard:', error)
      }
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  const handleAutoSubmit = async () => {
    setSubmitError(null)
    
    try {
      const response = await fetch('/api/demo/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName,
          walletAddress,
          isVerified,
          score,
        }),
      })

      if (response.ok) {
        setSubmitted(true)
        await fetchLeaderboard()
      } else {
        const error = await response.json()
        setSubmitError(error.error || 'Failed to submit score')
      }
    } catch (error) {
      console.error('Error submitting score:', error)
      setSubmitError('Network error. Please try again.')
    }
  }

  const handleBuyEntry = async () => {
    await onBuyEntry()
    onBackToHome()
  }

  return (
    <div className="container">
      <div className={styles.result}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('demoComplete')}</h1>
          <div className={styles.scoreDisplay}>
            <div className={styles.scoreLabel}>{t('score')}</div>
            <div className={styles.scoreValue}>{score}</div>
          </div>
        </div>

        {submitError && (
          <div className={styles.errorMessage}>
            {submitError}
          </div>
        )}
        
        {!submitted ? (
          <div className={styles.submittingMessage}>
            Submitting score...
          </div>
        ) : (
          <div className={styles.submittedMessage}>
            ✅ Score submitted! Check the leaderboard below.
          </div>
        )}

        <div className={styles.leaderboardSection}>
          <h2 className={styles.leaderboardTitle}>Test Leaderboard (Top 10)</h2>
          {loadingLeaderboard ? (
            <div className={styles.loading}>Loading...</div>
          ) : leaderboard.length === 0 ? (
            <div className={styles.emptyLeaderboard}>
              No scores yet. Be the first!
            </div>
          ) : (
            <div className={styles.leaderboardList}>
              {leaderboard.map((entry) => (
                <div key={`${entry.rank}-${entry.submittedAt}`} className={styles.leaderboardEntry}>
                  <div className={styles.entryRank}>#{entry.rank}</div>
                  <div className={styles.entryName}>{entry.playerName}</div>
                  <div className={styles.entryScore}>{entry.score}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.message}>
          <p>{t('tutorial3Text')}</p>
        </div>

        <div className={styles.actions}>
          <button 
            className="btn btn-primary btn-large"
            onClick={handleBuyEntry}
          >
            {t('buyEntryToPlayReal')}
          </button>

          <button 
            className="btn btn-secondary"
            onClick={onBackToHome}
          >
            {t('backToHome')}
          </button>
        </div>
      </div>
    </div>
  )
}

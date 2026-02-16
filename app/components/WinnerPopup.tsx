'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '../contexts/SessionContext'
import { useLanguage } from '../contexts/LanguageContext'
import { sounds } from '@/lib/sounds'
import styles from './WinnerPopup.module.css'

interface WinnerInfo {
  eventId: number
  rank: number
  prizeAmount: string
  eventEndedAt: string
}

const DISCORD_URL = 'https://discord.gg/nekBauET'

// Prize distribution percentages (same as GameResult.tsx)
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

export default function WinnerPopup() {
  const { session } = useSession()
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const isDev = process.env.NEXT_PUBLIC_ENV !== 'production'
  const isPreview = isDev && searchParams.get('preview_winner') === 'true'
  
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isPreview) {
      fetchPreviewData()
      return
    }

    if (session?.address) {
      checkWinnerStatus()
    }
  }, [session?.address, isPreview])

  const fetchPreviewData = async () => {
    try {
      const previewRank = 3
      const prizeAmount = 50
      
      setWinnerInfo({
        eventId: 1,
        rank: previewRank,
        prizeAmount: prizeAmount.toString(),
        eventEndedAt: new Date().toISOString()
      })
      setVisible(true)
      sounds.newHighScore()
    } catch (err) {
      console.error('Error fetching preview config:', err)
    }
  }

  const checkWinnerStatus = async () => {
    if (!session?.address) return

    try {
      const response = await fetch(`/api/winner/check?address=${session.address}`)
      if (response.ok) {
        const data = await response.json()
        if (data.isWinner && !hasSeenPopup(data.eventId)) {
          setWinnerInfo(data)
          setVisible(true)
          sounds.newHighScore()
        }
      }
    } catch (err) {
      console.error('Error checking winner status:', err)
    }
  }

  const hasSeenPopup = (eventId: number): boolean => {
    if (typeof window === 'undefined') return false
    const seen = localStorage.getItem(`winner_popup_seen_${eventId}`)
    return seen === 'true'
  }

  const markAsSeen = () => {
    if (winnerInfo && typeof window !== 'undefined') {
      localStorage.setItem(`winner_popup_seen_${winnerInfo.eventId}`, 'true')
    }
  }

  const handleDismiss = () => {
    markAsSeen()
    setDismissed(true)
    setTimeout(() => setVisible(false), 300)
  }

  const handleDiscordClick = () => {
    window.open(DISCORD_URL, '_blank', 'noopener,noreferrer')
  }

  if (!visible || !winnerInfo) return null

  return (
    <div className={`${styles.overlay} ${dismissed ? styles.fadeOut : ''}`}>
      <div className={`${styles.popup} ${dismissed ? styles.slideOut : ''}`}>
        <div className={styles.confetti}>
          <span>🎉</span>
          <span>🏆</span>
          <span>🎉</span>
        </div>
        
        <h2 className={styles.title}>GOOD JOB!</h2>
        <p className={styles.subtitle}>You placed <strong>#{winnerInfo.rank}</strong> in the competition!</p>
        
        <div className={styles.prizeCard}>
          <div className={styles.prizeAmount}>
            <span className={styles.prizeLabel}>Your Prize</span>
            <span className={styles.prizeValue}>{winnerInfo.prizeAmount} WLD</span>
          </div>
        </div>
        
        <div className={styles.infoBox}>
          <p className={styles.infoText}>
            Please be patient, as prizes are <strong>manually distributed</strong>. The distribution of prizes can take up to <strong>24 hours</strong>.
          </p>
          <p className={styles.infoText} style={{ marginTop: '8px' }}>
            If it isn't delivered by then, please contact our mods on the Discord server.
          </p>
        </div>
        
        <div className={styles.discordSection}>
          <button className={styles.discordButton} onClick={handleDiscordClick}>
            <svg className={styles.discordIcon} viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
            </svg>
            Join Discord for Support
          </button>
        </div>
        
        <button className={styles.closeButton} onClick={handleDismiss}>
          Got it!
        </button>
      </div>
    </div>
  )
}

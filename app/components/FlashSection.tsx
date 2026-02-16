'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '../contexts/SessionContext'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './FlashSection.module.css'

interface FlashData {
  flashEvent: {
    id: number
    prizePool: number
  } | null
  hasCredit: boolean
  hasPlayed: boolean
  secondsLeft: number
  entryFee: number
}

export default function FlashSection() {
  const router = useRouter()
  const { session } = useSession()
  const { t } = useLanguage()
  const [flashData, setFlashData] = useState<FlashData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFlashStatus()
    const interval = setInterval(fetchFlashStatus, 15000)
    return () => clearInterval(interval)
  }, [session])

  const fetchFlashStatus = async () => {
    try {
      const address = session?.address || 'anonymous'
      const response = await fetch(`/api/flash/current?address=${address}`, {
        headers: { 'Cache-Control': 'no-cache' }
      })
      if (response.ok) {
        const data = await response.json()
        setFlashData(data)
      }
    } catch (err) {
      console.error('Flash status error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
        </div>
      </div>
    )
  }

  if (!flashData?.flashEvent) {
    return null
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.flashBadge}>
          <span className={styles.flashIcon}>⚡</span>
          <span>FLASH</span>
        </div>
        <span className={styles.timeLeft}>{formatTime(flashData.secondsLeft)}</span>
      </div>
      
      <div className={styles.content}>
        <div className={styles.prizeInfo}>
          <span className={styles.prizeLabel}>Prize Pool</span>
          <span className={styles.prizeValue}>{flashData.flashEvent.prizePool} WLD</span>
        </div>
        
        <div className={styles.statusInfo}>
          {flashData.hasPlayed ? (
            <span className={styles.playedBadge}>Played</span>
          ) : flashData.hasCredit ? (
            <span className={styles.readyBadge}>Ready to Play</span>
          ) : (
            <span className={styles.entryFee}>{flashData.entryFee} WLD entry</span>
          )}
        </div>
      </div>

      <button 
        onClick={() => router.push('/flash')} 
        className={styles.playButton}
      >
        {flashData.hasPlayed ? 'View Results' : flashData.hasCredit ? 'Play Now' : 'Enter Flash Round'}
      </button>
    </div>
  )
}

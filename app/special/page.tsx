'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useSession } from '../contexts/SessionContext'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './special.module.css'

interface FlashEvent {
  id: number
  prizePool: number
  secondsLeft: number
  entryFee: number
  hasCredit: boolean
  hasPlayed: boolean
}

interface OneLifeEvent {
  id: number
  prizePool: number
  secondsLeft: number
  entryFee: number
  hasCredit: boolean
  hasPlayed: boolean
  isEliminated: boolean
}

const LightningIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect x="12" y="2" width="4" height="4" fill="#FDE047" />
    <rect x="10" y="6" width="4" height="4" fill="#FBBF24" />
    <rect x="8" y="10" width="8" height="4" fill="#F59E0B" />
    <rect x="10" y="14" width="4" height="4" fill="#FBBF24" />
    <rect x="8" y="18" width="4" height="4" fill="#FDE047" />
  </svg>
)

const SkullIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect x="6" y="4" width="12" height="4" fill="#E5E7EB" />
    <rect x="4" y="8" width="4" height="8" fill="#F3F4F6" />
    <rect x="16" y="8" width="4" height="8" fill="#F3F4F6" />
    <rect x="8" y="8" width="8" height="8" fill="#F3F4F6" />
    <rect x="6" y="10" width="4" height="4" fill="#1F2937" />
    <rect x="14" y="10" width="4" height="4" fill="#1F2937" />
    <rect x="10" y="14" width="4" height="2" fill="#1F2937" />
    <rect x="8" y="16" width="2" height="4" fill="#E5E7EB" />
    <rect x="11" y="16" width="2" height="4" fill="#E5E7EB" />
    <rect x="14" y="16" width="2" height="4" fill="#E5E7EB" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48">
    <rect x="8" y="2" width="8" height="2" fill="#F87171" />
    <rect x="6" y="4" width="2" height="2" fill="#F87171" />
    <rect x="16" y="4" width="2" height="2" fill="#F87171" />
    <rect x="4" y="6" width="16" height="2" fill="#FCA5A5" />
    <rect x="2" y="8" width="2" height="10" fill="#FCA5A5" />
    <rect x="20" y="8" width="2" height="10" fill="#FCA5A5" />
    <rect x="4" y="8" width="16" height="10" fill="#FEE2E2" />
    <rect x="4" y="18" width="16" height="2" fill="#FCA5A5" />
    <rect x="11" y="10" width="2" height="6" fill="#1F2937" />
    <rect x="13" y="12" width="4" height="2" fill="#1F2937" />
  </svg>
)

const TargetIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect x="10" y="2" width="4" height="4" fill="#EF4444" />
    <rect x="2" y="10" width="4" height="4" fill="#EF4444" />
    <rect x="18" y="10" width="4" height="4" fill="#EF4444" />
    <rect x="10" y="18" width="4" height="4" fill="#EF4444" />
    <rect x="6" y="6" width="12" height="12" fill="#FCA5A5" />
    <rect x="8" y="8" width="8" height="8" fill="#FEE2E2" />
    <rect x="10" y="10" width="4" height="4" fill="#EF4444" />
  </svg>
)

const CrownIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect x="2" y="10" width="4" height="4" fill="#FDE047" />
    <rect x="18" y="10" width="4" height="4" fill="#FDE047" />
    <rect x="10" y="6" width="4" height="4" fill="#FDE047" />
    <rect x="4" y="12" width="16" height="4" fill="#FBBF24" />
    <rect x="4" y="16" width="16" height="2" fill="#D97706" />
  </svg>
)

const DiamondIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect x="10" y="2" width="4" height="4" fill="#60A5FA" />
    <rect x="6" y="6" width="4" height="4" fill="#93C5FD" />
    <rect x="14" y="6" width="4" height="4" fill="#93C5FD" />
    <rect x="2" y="10" width="4" height="4" fill="#3B82F6" />
    <rect x="18" y="10" width="4" height="4" fill="#3B82F6" />
    <rect x="6" y="10" width="12" height="4" fill="#60A5FA" />
    <rect x="6" y="14" width="4" height="4" fill="#3B82F6" />
    <rect x="14" y="14" width="4" height="4" fill="#3B82F6" />
    <rect x="10" y="14" width="4" height="4" fill="#60A5FA" />
    <rect x="10" y="18" width="4" height="4" fill="#2563EB" />
  </svg>
)

const SwordIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect x="18" y="2" width="4" height="4" fill="#9CA3AF" />
    <rect x="14" y="6" width="4" height="4" fill="#D1D5DB" />
    <rect x="10" y="10" width="4" height="4" fill="#D1D5DB" />
    <rect x="6" y="14" width="4" height="4" fill="#78716C" />
    <rect x="2" y="18" width="4" height="4" fill="#78716C" />
    <rect x="4" y="14" width="2" height="2" fill="#A8A29E" />
    <rect x="8" y="18" width="2" height="2" fill="#A8A29E" />
  </svg>
)

export default function SpecialPage() {
  const router = useRouter()
  const { session } = useSession()
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'flash' | 'onelife'>('flash')
  const [flashEvent, setFlashEvent] = useState<FlashEvent | null>(null)
  const [oneLifeEvent, setOneLifeEvent] = useState<OneLifeEvent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSpecialEvents()
    const interval = setInterval(fetchSpecialEvents, 15000)
    return () => clearInterval(interval)
  }, [session])

  const fetchSpecialEvents = async () => {
    try {
      const address = session?.address || 'anonymous'
      
      const flashRes = await fetch(`/api/flash/current?address=${address}`)
      if (flashRes.ok) {
        const data = await flashRes.json()
        if (data.flashEvent) {
          setFlashEvent({
            id: data.flashEvent.id,
            prizePool: data.flashEvent.prizePool,
            secondsLeft: data.secondsLeft,
            entryFee: data.entryFee,
            hasCredit: data.hasCredit,
            hasPlayed: data.hasPlayed
          })
        } else {
          setFlashEvent(null)
        }
      }

      try {
        const oneLifeRes = await fetch(`/api/onelife/current?address=${address}`)
        if (oneLifeRes.ok) {
          const data = await oneLifeRes.json()
          if (data.event) {
            setOneLifeEvent({
              id: data.event.id,
              prizePool: data.event.prizePool,
              secondsLeft: data.secondsLeft,
              entryFee: data.entryFee,
              hasCredit: data.hasCredit,
              hasPlayed: data.hasPlayed,
              isEliminated: data.isEliminated
            })
          }
        }
      } catch {}
    } catch (err) {
      console.error('Special events fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) return `${hrs}h ${mins}m`
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }

  const handlePlayFlash = () => {
    router.push('/flash')
  }

  const handlePlayOneLife = () => {
    router.push('/onelife')
  }

  return (
    <div className={styles.container}>
      <TopBar title={t('special') || 'Special'} />
      
      <main className={styles.main}>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'flash' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('flash')}
          >
            <LightningIcon />
            <span>Flash</span>
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'onelife' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('onelife')}
          >
            <SkullIcon />
            <span>One Life</span>
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingCard}>
            <div className={styles.spinner}></div>
            <p>Loading...</p>
          </div>
        ) : activeTab === 'flash' ? (
          <div className={styles.eventSection}>
            <div className={styles.eventCard}>
              <div className={styles.eventHeader}>
                <div className={styles.eventBadge}>
                  <LightningIcon />
                  <span>FLASH ROUND</span>
                </div>
                {flashEvent && (
                  <span className={styles.timeLeft}>{formatTime(flashEvent.secondsLeft)}</span>
                )}
              </div>

              <div className={styles.modeContent}>
                <div className={styles.modeIconLarge}>
                  <LightningIcon />
                </div>
                <div className={styles.modeDetails}>
                  <div className={styles.detailRow}>Winner takes all</div>
                  <div className={styles.detailRow}>Rounds last 2 days</div>
                </div>
                <div className={styles.wipBadge}>Work in Progress</div>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.eventSection}>
            <div className={`${styles.eventCard} ${styles.oneLifeCard}`}>
              <div className={`${styles.eventHeader} ${styles.oneLifeHeader}`}>
                <div className={styles.eventBadge}>
                  <SkullIcon />
                  <span>ONE LIFE</span>
                </div>
                {oneLifeEvent && (
                  <span className={styles.timeLeft}>{formatTime(oneLifeEvent.secondsLeft)}</span>
                )}
              </div>

              <div className={`${styles.modeContent} ${styles.oneLifeContent}`}>
                <div className={styles.modeIconLarge}>
                  <SkullIcon />
                </div>
                <div className={styles.modeDetails}>
                  <div className={styles.detailRow}>You get one chance only</div>
                  <div className={styles.detailRow}>1st place wins it all</div>
                  <div className={styles.detailRow}>Lasts 5 days</div>
                </div>
                <div className={`${styles.wipBadge} ${styles.wipBadgeRed}`}>Work in Progress</div>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

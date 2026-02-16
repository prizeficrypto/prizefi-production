'use client'

import { useState, useEffect } from 'react'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useLanguage } from '../contexts/LanguageContext'
import { shortenAddress } from '../lib/minikit'
import styles from './records.module.css'

interface EventChampion {
  id: number
  eventId: number
  address: string
  username: string | null
  score: number
  eventStartedAt: string
  eventEndedAt: string
  createdAt: string
}

interface RecordsData {
  champions: EventChampion[]
}

export default function Records() {
  const { t } = useLanguage()
  const [data, setData] = useState<RecordsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecords()
  }, [])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/records')
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error('Error fetching records:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="container">
      <TopBar title={t('records')} showSettings={false} />
      
      <main className={styles.main}>
        <div className={styles.heroSection}>
          <span className={styles.heroIcon}>🏆</span>
          <h1 className={styles.heroTitle}>{t('pastChampions')}</h1>
          <p className={styles.heroSubtitle}>{t('hallOfFame')}</p>
        </div>

        {loading ? (
          <div className={styles.loading}>{t('loading')}</div>
        ) : (
          <div className={styles.section}>
            {data?.champions && data.champions.length > 0 ? (
              data.champions.map((champion) => (
                <div key={champion.id} className={styles.championCard}>
                  <div className={styles.championHeader}>
                    <div className={styles.championInfo}>
                      <div className={styles.championEvent}>Event #{champion.eventId}</div>
                      <div className={styles.championName}>
                        {champion.username || shortenAddress(champion.address)}
                      </div>
                    </div>
                    <div className={styles.recordBadge}>1st</div>
                  </div>
                  <div className={styles.championScore}>{champion.score} pts</div>
                  <div className={styles.championDate}>
                    {formatDate(champion.eventEndedAt)}
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>👑</div>
                <div className={styles.emptyTitle}>{t('noChampionsYet')}</div>
                <div className={styles.emptyText}>{t('firstEventPending')}</div>
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

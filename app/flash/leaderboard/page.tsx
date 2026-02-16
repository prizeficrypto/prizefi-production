'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '../../components/TopBar'
import BottomNav from '../../components/BottomNav'
import { useSession } from '../../contexts/SessionContext'
import styles from '../flash.module.css'

interface LeaderboardEntry {
  rank: number
  address: string
  username?: string
  totalScore: number
  isCurrentUser: boolean
}

export default function FlashLeaderboard() {
  const router = useRouter()
  const { session } = useSession()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [flashEventId, setFlashEventId] = useState<number | null>(null)
  const [prizePool, setPrizePool] = useState(0)

  useEffect(() => {
    fetchLeaderboard()
  }, [session])

  const fetchLeaderboard = async () => {
    try {
      const address = session?.address || ''
      const response = await fetch(`/api/flash/leaderboard?address=${address}`)
      
      if (!response.ok) throw new Error('Failed to fetch leaderboard')
      
      const data = await response.json()
      setFlashEventId(data.flashEventId)
      setPrizePool(parseFloat(data.prizePoolWld) || 0)
      setLeaderboard(data.entries || [])
    } catch (err) {
      console.error('Failed to fetch flash leaderboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const shortenAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <main className={styles.container}>
      <TopBar title="Flash Leaderboard" />
      
      <div className={styles.content}>
        <div className={styles.flashHeader}>
          <div className={styles.flashBadge}>FLASH</div>
          <h1 className={styles.title}>Leaderboard</h1>
          {prizePool > 0 && (
            <p className={styles.subtitle}>Prize Pool: {prizePool} WLD</p>
          )}
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Loading...</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className={styles.noEvent}>
            <div className={styles.noEventIcon}>🏆</div>
            <h2>No Entries Yet</h2>
            <p>Be the first to compete in this Flash round!</p>
          </div>
        ) : (
          <div className={styles.leaderboardList}>
            {leaderboard.map((entry, index) => (
              <div 
                key={entry.address} 
                className={`${styles.leaderboardEntry} ${entry.isCurrentUser ? styles.currentUser : ''}`}
              >
                <span className={styles.rank}>
                  {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                </span>
                <span className={styles.playerName}>
                  {entry.username || shortenAddress(entry.address)}
                </span>
                <span className={styles.score}>{entry.totalScore}</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => router.push('/flash')} className={styles.backButton}>
          Back to Flash Round
        </button>
      </div>

      <BottomNav />
    </main>
  )
}

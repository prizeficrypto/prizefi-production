'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopBar from '../components/TopBar'
import { useLanguage } from '../contexts/LanguageContext'
import { useSession } from '../contexts/SessionContext'
import styles from './profile.module.css'

export const dynamic = 'force-dynamic'

interface ProfileData {
  playerName: string
  walletAddress: string | null
  username: string | null
  isVerified: boolean
  allTimeBestScore: number
  demoGamesPlayed: number
  demoHighScore: number
  competitionGamesPlayed: number
  competitionHighScore: number
  currentRank: number | null
}

const tierColors: Record<string, string> = {
  Bronze: '#8B5E3C',
  Silver: '#A8A8A8',
  Gold: '#FFD700',
  Inferno: '#E53E3E',
}

function getProfileTier(allTimeBest: number) {
  if (allTimeBest >= 1000) return { name: 'Inferno', color: '#E53E3E' }
  if (allTimeBest >= 301) return { name: 'Gold', color: '#FFD700' }
  if (allTimeBest >= 100) return { name: 'Silver', color: '#A8A8A8' }
  return { name: 'Bronze', color: '#8B5E3C' }
}

function ProfileTrophy({ allTimeBest, size = 28 }: { allTimeBest: number; size?: number }) {
  const tier = getProfileTier(allTimeBest)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 4h10v2h3v4c0 1.5-1 3-3 3h-1c-.5 1.5-1.5 2.5-3 3v2h3v2H8v-2h3v-2c-1.5-.5-2.5-1.5-3-3H7c-2 0-3-1.5-3-3V6h3V4z" fill={tier.color} />
      <path d="M4 6h3v4c0 .5-.5 1-1 1H5c-.5 0-1-.5-1-1V6zM17 6h3v4c0 .5-.5 1-1 1h-1c-.5 0-1-.5-1-1V6z" fill={tier.color} opacity="0.7" />
    </svg>
  )
}

function ProfileContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const { session } = useSession()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const playerName = searchParams.get('playerName')
  const walletAddress = searchParams.get('walletAddress')

  useEffect(() => {
    if (!playerName && !walletAddress) {
      router.push('/leaderboard')
      return
    }

    fetchProfile()
  }, [playerName, walletAddress])

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (playerName) params.append('playerName', playerName)
      if (walletAddress) params.append('walletAddress', walletAddress)

      const response = await fetch(`/api/profile?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    const effectiveAddress = session?.address || profile?.walletAddress
    if (!effectiveAddress) return

    try {
      await navigator.clipboard.writeText(effectiveAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <TopBar title="Profile" showBack={true} />
        <main className={styles.main}>
          <p className={styles.loading}>Loading profile...</p>
        </main>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container">
        <TopBar title="Profile" showBack={true} />
        <main className={styles.main}>
          <p className={styles.error}>Profile not found</p>
        </main>
      </div>
    )
  }

  return (
    <div className="container">
      <TopBar title="User Profile" showBack={true} />
      
      <main className={styles.main}>
        <div className="card">
          <div className={styles.playerNameRow}>
            <ProfileTrophy allTimeBest={profile.allTimeBestScore} />
            <h2 className={styles.playerName} style={{ color: getProfileTier(profile.allTimeBestScore).color }}>
              {profile.username || profile.playerName}
            </h2>
          </div>
          <div className={styles.tierLabel} style={{ color: getProfileTier(profile.allTimeBestScore).color }}>
            {getProfileTier(profile.allTimeBestScore).name}
          </div>
          
          {(profile.walletAddress || session?.address) && (
            <>
              <div className={styles.usernameSection}>
                <div className={styles.usernameLabel}>World Username</div>
                <div className={styles.usernameDisplay}>
                  <span className={styles.usernameText}>
                    {profile.username || 'Not set'}
                  </span>
                </div>
              </div>
              
              <div className={styles.walletSection}>
                <div className={styles.walletLabel}>{t('verificationStatus')}</div>
                <div className={styles.walletDisplay}>
                  <span className={styles.walletAddress}>
                    {profile.isVerified ? t('verified') : t('notVerified')}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3 className={styles.sectionTitle}>{t('demoStats')}</h3>
          <div className={styles.statGrid}>
            <div className={styles.statItem}>
              <div className={styles.statLabel}>Games Played</div>
              <div className={styles.statValue}>{profile.demoGamesPlayed}</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statLabel}>High Score</div>
              <div className={styles.statValue}>{profile.demoHighScore}</div>
            </div>
          </div>
        </div>

        {profile.competitionGamesPlayed > 0 && (
          <div className="card">
            <h3 className={styles.sectionTitle}>Competition Stats</h3>
            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <div className={styles.statLabel}>Games Played</div>
                <div className={styles.statValue}>{profile.competitionGamesPlayed}</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statLabel}>High Score</div>
                <div className={styles.statValue}>{profile.competitionHighScore}</div>
              </div>
              {profile.currentRank && (
                <div className={styles.statItem}>
                  <div className={styles.statLabel}>Current Rank</div>
                  <div className={styles.statValue}>#{profile.currentRank}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          className="btn btn-secondary"
          onClick={() => router.push('/leaderboard')}
        >
          Back to Leaderboard
        </button>
      </main>
    </div>
  )
}

export default function Profile() {
  return (
    <Suspense fallback={
      <div className="container">
        <TopBar title="Profile" showBack={true} />
        <main className={styles.main}>
          <p className={styles.loading}>Loading profile...</p>
        </main>
      </div>
    }>
      <ProfileContent />
    </Suspense>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import EventCountdown from '../components/EventCountdown'
import { useSession } from '../contexts/SessionContext'
import { useLanguage } from '../contexts/LanguageContext'
import { shortenAddress } from '../lib/minikit'
import styles from './leaderboard.module.css'

interface LeaderboardEntry {
  rank: number
  address: string
  username: string | null
  isVerified: boolean
  score: number
  prizeAmount: number
  allTimeBestScore?: number
}

interface LeaderboardData {
  eventId: number
  leaderboard: LeaderboardEntry[]
  myRank: number | null
  myTotalScore: number
  eventStatus: string
  endTime: string
  timeUntilNext?: number | null
  prizePool?: number
}

interface DemoLeaderboardEntry {
  rank: number
  playerName: string
  walletAddress?: string | null
  username?: string | null
  isVerified?: boolean
  score: number
  submittedAt: string
  allTimeBestScore?: number
}

interface DemoChampion {
  score: number
  playerName: string
  walletAddress?: string | null
  username?: string | null
  isVerified?: boolean
  achievedAt: string
}

interface DemoLeaderboardData {
  leaderboard: DemoLeaderboardEntry[]
  myRank: number | null
  myBestScore: number | null
  champion: DemoChampion | null
}

interface PastEvent {
  id: number
  roundNumber: number
  startedAt: string
  endedAt: string
  finalized: boolean
  prizePoolWld?: number
}

export default function Leaderboard() {
  const router = useRouter()
  const { session } = useSession()
  const { t } = useLanguage()
  
  // Check URL query param to set initial tab
  const [activeTab, setActiveTab] = useState<'demo' | 'competition'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab === 'competition') return 'competition'
      return 'demo'
    }
    return 'demo'
  })
  const [flashLeaderboard, setFlashLeaderboard] = useState<LeaderboardEntry[]>([])
  const [flashLoading, setFlashLoading] = useState(false)
  
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [demoData, setDemoData] = useState<DemoLeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [demoLoading, setDemoLoading] = useState(true)
  const [pastEvents, setPastEvents] = useState<PastEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [viewingPrevious, setViewingPrevious] = useState(false)
  const [showUpdateBanner, setShowUpdateBanner] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('prizefi_lb_banner_dismissed_v1') !== 'true'
  })

  const fetchDemoLeaderboard = async () => {
    setDemoLoading(true)
    try {
      const url = session?.address 
        ? `/api/demo/leaderboard?limit=10&address=${session.address}`
        : '/api/demo/leaderboard?limit=10'
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const result = await response.json()
        setDemoData({
          leaderboard: result.leaderboard || [],
          myRank: result.myRank,
          myBestScore: result.myBestScore,
          champion: result.champion
        })
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('Demo leaderboard fetch timed out')
      } else {
        console.error('Error fetching demo leaderboard:', error)
      }
    } finally {
      setDemoLoading(false)
    }
  }

  const fetchFlashLeaderboard = async () => {
    setFlashLoading(true)
    try {
      const response = await fetch('/api/flash/leaderboard')
      if (response.ok) {
        const data = await response.json()
        setFlashLeaderboard(data.leaderboard || [])
      }
    } catch (error) {
      console.error('Error fetching flash leaderboard:', error)
    } finally {
      setFlashLoading(false)
    }
  }

  const fetchLeaderboard = async (isRefresh = false, eventId?: number | null) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      let url = session?.address 
        ? `/api/leaderboard?address=${session.address}`
        : '/api/leaderboard'
      
      if (eventId) {
        url += `${url.includes('?') ? '&' : '?'}eventId=${eventId}`
      }
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('Leaderboard fetch timed out')
      } else {
        console.error('Error fetching leaderboard:', error)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchPastEvents = async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      const response = await fetch('/api/events/history?limit=10', { signal: controller.signal })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const result = await response.json()
        setPastEvents(result.events || [])
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('Past events fetch timed out')
      } else {
        console.error('Error fetching past events:', error)
      }
    }
  }

  useEffect(() => {
    fetchDemoLeaderboard()
    fetchLeaderboard()
    fetchPastEvents()
    fetchFlashLeaderboard()
  }, [session?.address])

  const handleViewPreviousRound = (eventId: number) => {
    setSelectedEventId(eventId)
    setViewingPrevious(true)
    fetchLeaderboard(false, eventId)
  }

  const handleBackToCurrent = () => {
    setSelectedEventId(null)
    setViewingPrevious(false)
    fetchLeaderboard()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const isWalletAddress = (name: string) => {
    return name.startsWith('0x') && name.length === 42
  }

  const getRankClass = (rank: number) => {
    if (rank === 1) return styles.topRank1
    if (rank === 2) return styles.topRank2
    if (rank === 3) return styles.topRank3
    return ''
  }

  const tierColors: Record<string, string> = {
    Bronze: '#8B5E3C',
    Silver: '#A8A8A8',
    Gold: '#FFD700',
    Inferno: '#E53E3E',
  }

  const getScoreTier = (allTimeBest: number) => {
    if (allTimeBest >= 1000) return { name: 'Inferno', className: styles.tierInferno }
    if (allTimeBest >= 301) return { name: 'Gold', className: styles.tierGold }
    if (allTimeBest >= 100) return { name: 'Silver', className: styles.tierSilver }
    return { name: 'Bronze', className: styles.tierBronze }
  }

  const TierTrophy = ({ allTimeBest }: { allTimeBest: number }) => {
    const tier = getScoreTier(allTimeBest)
    const fill = tierColors[tier.name]
    return (
      <svg className={styles.tierTrophy} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 4h10v2h3v4c0 1.5-1 3-3 3h-1c-.5 1.5-1.5 2.5-3 3v2h3v2H8v-2h3v-2c-1.5-.5-2.5-1.5-3-3H7c-2 0-3-1.5-3-3V6h3V4z" fill={fill} />
        <path d="M4 6h3v4c0 .5-.5 1-1 1H5c-.5 0-1-.5-1-1V6zM17 6h3v4c0 .5-.5 1-1 1h-1c-.5 0-1-.5-1-1V6z" fill={fill} opacity="0.7" />
      </svg>
    )
  }

  const formatTimeSince = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    
    const seconds = Math.floor(diffMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) {
      return `${days}${t('days')} ${hours % 24}${t('hours')}`
    } else if (hours > 0) {
      return `${hours}${t('hours')} ${minutes % 60}${t('minutes')}`
    } else if (minutes > 0) {
      return `${minutes}${t('minutes')}`
    } else {
      return t('justNow')
    }
  }

  const getAnonymousName = (index: number) => {
    return `Anonymous ${index}`
  }

  const getChampionDisplayName = () => {
    if (!demoData?.champion) return ''
    const champion = demoData.champion
    return champion.username 
      || (!isWalletAddress(champion.playerName) ? champion.playerName : null)
      || getAnonymousName(1)
  }

  return (
    <div className="container">
      <TopBar title={t('leaderboard')} showBack={true} />
      
      <main className={styles.main}>
        <div className={styles.heroSection}>
          <span className={styles.heroIcon}>🏆</span>
          <h2 className={styles.heroTitle}>{t('leaderboard')}</h2>
          <p className={styles.heroSubtitle}>{t('leaderboardSubtitle')}</p>
          <p className={styles.heroExplanation}>{t('leaderboardExplanation')}</p>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'demo' ? styles.active : ''}`}
            onClick={() => setActiveTab('demo')}
          >
            {t('demo')}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'competition' ? styles.active : ''}`}
            onClick={() => setActiveTab('competition')}
          >
            {t('competition')}
          </button>
        </div>

        {activeTab === 'demo' ? (
          <div className={styles.demoSection}>
            {demoLoading ? (
              <p className={styles.message}>Loading demo leaderboard...</p>
            ) : !demoData || demoData.leaderboard.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🎮</div>
                <p className={styles.emptyText}>{t('noDemoScoresYet')}</p>
                <p className={styles.emptySubtext}>{t('playDemoToBeFirst')}</p>
              </div>
            ) : (
              <>
                {session && (
                  <div className={styles.myStats}>
                    <div className={styles.statItem}>
                      <div className={styles.statLabel}>{t('yourRank')}</div>
                      <div className={styles.statValue}>
                        {demoData.myRank ? `#${demoData.myRank}` : t('notRanked')}
                      </div>
                    </div>
                    <div className={styles.statItem}>
                      <div className={styles.statLabel}>{t('yourBestScore')}</div>
                      <div className={styles.statValue}>{demoData.myBestScore || 0}</div>
                    </div>
                  </div>
                )}
                
                {!session && (
                  <div className={styles.myStats}>
                    <p>{t('connectWalletToSeeRank')}</p>
                  </div>
                )}

                {demoData.champion && (
                  <div className={styles.championCard}>
                    <div className={styles.championHeader}>
                      <span className={styles.championCrown}>👑</span>
                      <span className={styles.championTitle}>{t('currentRecord')}</span>
                    </div>
                    <div className={styles.championScore}>{demoData.champion.score}</div>
                    <div className={styles.championPlayer}>
                      {t('by')} {getChampionDisplayName()}
                    </div>
                    <div className={styles.championDuration}>
                      {t('holdingFor')} {formatTimeSince(demoData.champion.achievedAt)}
                    </div>
                  </div>
                )}

                <div className={styles.sectionInfo}>
                  <button 
                    className={styles.refreshBtnInline}
                    onClick={fetchDemoLeaderboard}
                  >
                    {t('refresh')}
                  </button>
                </div>
                <div className="card">
                  <div className={styles.tableHeader}>
                    <div className={styles.rankCol}>{t('rank')}</div>
                    <div className={styles.playerCol}>{t('player')}</div>
                    <div className={styles.scoreCol}>{t('score')}</div>
                  </div>

                <div className={styles.tableBody}>
                  {demoData.leaderboard.map((entry, index) => {
                    const displayName = entry.username 
                      || (!isWalletAddress(entry.playerName) ? entry.playerName : null)
                      || getAnonymousName(index + 1)
                    
                    const isMe = session && entry.walletAddress && 
                      entry.walletAddress.toLowerCase() === session.address.toLowerCase()
                    
                    return (
                      <div
                        key={`${entry.rank}-${entry.submittedAt}`}
                        className={`${styles.tableRow} ${styles.clickable} ${getRankClass(entry.rank)} ${isMe ? styles.myRow : ''}`}
                        onClick={() => {
                          if (entry.walletAddress && entry.walletAddress.trim()) {
                            router.push(`/profile?walletAddress=${entry.walletAddress}`)
                          } else if (isWalletAddress(entry.playerName)) {
                            router.push(`/profile?walletAddress=${entry.playerName}`)
                          } else {
                            router.push(`/profile?playerName=${entry.playerName}`)
                          }
                        }}
                      >
                        <div className={`${styles.rankCol} ${entry.rank <= 3 ? styles.topRankNum : ''}`}>
                          #{entry.rank}
                        </div>
                        <div className={`${styles.playerCol} ${getScoreTier(entry.allTimeBestScore ?? entry.score).className}`}>
                          <TierTrophy allTimeBest={entry.allTimeBestScore ?? entry.score} />
                          {displayName}
                        </div>
                        <div className={styles.scoreCol}>{entry.score}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
              </>
            )}
          </div>
        ) : activeTab === 'competition' ? (
          <div className={styles.competitionSection}>
            {showUpdateBanner && (
              <div className={styles.updateBanner}>
                <div className={styles.updateBannerContent}>
                  <span className={styles.updateBannerIcon}>
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <rect x="10" y="4" width="4" height="12" fill="#fff" />
                      <rect x="10" y="18" width="4" height="4" fill="#fff" />
                    </svg>
                  </span>
                  <span className={styles.updateBannerText}>
                    As a plan to motivate more users into getting World ID verified, prizes will be cut by 3/4 for unverified users and redistributed to users who are verified.
                  </span>
                </div>
                <button
                  className={styles.updateBannerBtn}
                  onClick={() => {
                    setShowUpdateBanner(false)
                    localStorage.setItem('prizefi_lb_banner_dismissed_v1', 'true')
                  }}
                >
                  OK
                </button>
              </div>
            )}

            {viewingPrevious && (
              <div className={styles.previousRoundBanner}>
                <button className={styles.backBtn} onClick={handleBackToCurrent}>
                  ← Back to Current
                </button>
                <span className={styles.previousLabel}>
                  Viewing: Round ended {selectedEventId && pastEvents.find(e => e.id === selectedEventId) 
                    ? formatDate(pastEvents.find(e => e.id === selectedEventId)!.endedAt) 
                    : ''}
                  {selectedEventId && pastEvents.find(e => e.id === selectedEventId)?.prizePoolWld && (
                    <span className={styles.prizePoolLabel}> | Prize Pool: {pastEvents.find(e => e.id === selectedEventId)!.prizePoolWld} WLD</span>
                  )}
                </span>
              </div>
            )}

            {!viewingPrevious && pastEvents.length > 0 && (
              <div className={styles.previousRoundsSection}>
                <button 
                  className={styles.viewPreviousBtn}
                  onClick={() => handleViewPreviousRound(pastEvents[0].id)}
                >
                  📜 View Previous Round
                </button>
                {pastEvents.length > 1 && (
                  <select 
                    className={styles.roundSelect}
                    onChange={(e) => {
                      const eventId = parseInt(e.target.value, 10)
                      if (eventId) handleViewPreviousRound(eventId)
                    }}
                    value=""
                  >
                    <option value="">More rounds...</option>
                    {pastEvents.map((event, idx) => (
                      <option key={event.id} value={event.id}>
                        Round {idx + 1} - {formatDate(event.endedAt)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {loading ? (
              <p className={styles.message}>{t('connecting')}</p>
            ) : !data ? (
              <p className={styles.message}>{t('connectionError')}</p>
            ) : (
              <>
                {!viewingPrevious && (
                  <EventCountdown 
                    endTime={data.endTime} 
                    status={
                      data.eventStatus === 'ended' ? 'ended' : 
                      data.eventStatus === 'cooldown' ? 'cooldown' : 
                      'active'
                    }
                    timeUntilNext={data.timeUntilNext}
                    prizePool={data.prizePool}
                  />
                )}

                {session && data.myTotalScore > 0 && (
                  <div className={styles.myStats}>
                    <div className={styles.statItem}>
                      <div className={styles.statLabel}>{t('yourTotalScore')}</div>
                      <div className={styles.statValue}>{data.myTotalScore}</div>
                    </div>
                  </div>
                )}
                
                {!session && (
                  <div className={styles.myStats}>
                    <p>{t('connectWalletToSeeRank')}</p>
                  </div>
                )}

                <div className={styles.refreshArea} onClick={() => fetchLeaderboard(true)}>
                  <button className={styles.refreshBtn} disabled={refreshing}>
                    {refreshing ? t('connecting') : t('pullToRefresh')}
                  </button>
                </div>

                <div className="card">
                  <div className={styles.tableHeaderWithPrize}>
                    <div className={styles.rankCol}>{t('rank')}</div>
                    <div className={styles.playerCol}>{t('player')}</div>
                    <div className={styles.scoreCol}>{t('score')}</div>
                    <div className={styles.prizeCol}>Prize</div>
                  </div>

                  <div className={styles.tableBody}>
                    {data.leaderboard.length === 0 ? (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>🎯</div>
                        <p className={styles.emptyText}>{t('noCompetitionScoresYet')}</p>
                        <p className={styles.emptySubtext}>{t('beFirstToPlay')}</p>
                      </div>
                    ) : (
                      data.leaderboard.map((entry, index) => {
                        const tier = getScoreTier(entry.allTimeBestScore ?? entry.score)
                        return (
                          <div
                            key={entry.rank}
                            className={`${styles.tableRowWithPrize} ${styles.clickable} ${getRankClass(entry.rank)} ${
                              session && entry.address.toLowerCase() === session.address.toLowerCase()
                                ? styles.myRow
                                : ''
                            }`}
                            onClick={() => router.push(`/profile?walletAddress=${entry.address}`)}
                          >
                            <div className={`${styles.rankCol} ${entry.rank <= 3 ? styles.topRankNum : ''}`}>
                              #{entry.rank}
                            </div>
                            <div className={`${styles.playerCol} ${tier.className}`}>
                              <TierTrophy allTimeBest={entry.allTimeBestScore ?? entry.score} />
                              {entry.username || getAnonymousName(index + 1)}
                            </div>
                            <div className={styles.scoreCol}>{entry.score}</div>
                            <div className={styles.prizeCol}>
                              {entry.prizeAmount > 0 ? (
                                <span className={styles.prizeAmount}>{entry.prizeAmount.toFixed(2)} WLD</span>
                              ) : (
                                <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>—</span>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

              </>
            )}
          </div>
        ) : activeTab === 'flash' ? (
          <div className={styles.demoSection}>
            {flashLoading ? (
              <p className={styles.message}>Loading Flash leaderboard...</p>
            ) : flashLeaderboard.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>⚡</div>
                <p className={styles.emptyText}>No Flash Round scores yet</p>
                <p className={styles.emptySubtext}>Play a Flash Round to compete!</p>
              </div>
            ) : (
              <div className={styles.leaderboardList}>
                <div className={styles.listHeader}>
                  <div className={styles.rankCol}>#</div>
                  <div className={styles.playerCol}>Player</div>
                  <div className={styles.scoreCol}>Score</div>
                  <div className={styles.prizeCol}>Prize</div>
                </div>
                {flashLeaderboard.map((entry, index) => (
                  <div 
                    key={entry.address} 
                    className={`${styles.listItem} ${entry.address === session?.address ? styles.currentUser : ''}`}
                  >
                    <div className={styles.rankCol}>
                      {entry.rank <= 3 ? (
                        <span className={styles[`rank${entry.rank}`]}>
                          {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                        </span>
                      ) : (
                        entry.rank
                      )}
                    </div>
                    <div className={`${styles.playerCol} ${getScoreTier(entry.allTimeBestScore ?? entry.score).className}`}>
                      <TierTrophy allTimeBest={entry.allTimeBestScore ?? entry.score} />
                      {entry.username || shortenAddress(entry.address)}
                      {entry.isVerified && <span className={styles.verifiedBadge}>✓</span>}
                    </div>
                    <div className={styles.scoreCol}>{entry.score}</div>
                    <div className={styles.prizeCol}>
                      {entry.prizeAmount > 0 ? (
                        <span className={styles.prizeAmount}>{entry.prizeAmount.toFixed(2)} WLD</span>
                      ) : (
                        <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </main>
      
      <BottomNav />
    </div>
  )
}

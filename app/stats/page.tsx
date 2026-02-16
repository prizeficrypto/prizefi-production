'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '../components/BottomNav'
import { useLanguage } from '../contexts/LanguageContext'
import { useSession } from '../contexts/SessionContext'
import styles from './stats.module.css'

interface GameRecord {
  id: number
  eventId?: number
  flashEventId?: number
  playerName?: string
  score: number
  date: string
}

interface PerformancePoint {
  score: number
  date: string
  type: 'competition' | 'demo'
}

interface StatsData {
  competition: {
    totalGames: number
    totalScore: number
    highScore: number
    avgScore: number
    eventsParticipated: number
    recentGames: GameRecord[]
  }
  demo: {
    totalGames: number
    highScore: number
    avgScore: number
    recentGames: GameRecord[]
  }
  activity: {
    competitionGamesLast30Days: number
    demoGamesLast30Days: number
    totalGamesLast30Days: number
  }
  totals: {
    allTimeGames: number
    overallHighScore: number
  }
  performanceHistory: PerformancePoint[]
}

export default function StatsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const { session } = useSession()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'competition' | 'demo'>('overview')

  useEffect(() => {
    if (!session?.address) {
      return
    }
    fetchStats()
  }, [session?.address])

  const fetchStats = async () => {
    if (!session?.address) return
    
    setLoading(true)
    try {
      const response = await fetch('/api/stats', {
        headers: {
          'x-wallet': session.address,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (!session?.address) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <h2 className={styles.emptyTitle}>Connect to View Stats</h2>
            <p className={styles.emptyText}>
              Connect your wallet to see your personal gaming statistics.
            </p>
          </div>
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('myStats') || 'My Stats'}</h1>
          <p className={styles.subtitle}>{t('personalPerformance') || 'Your Personal Performance'}</p>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>{t('loading') || 'Loading...'}</p>
          </div>
        ) : stats ? (
          <>
            <div className={styles.heroStats}>
              <div className={styles.heroCard}>
                <div className={styles.heroValue}>{stats.totals.allTimeGames}</div>
                <div className={styles.heroLabel}>{t('totalGames') || 'Total Games'}</div>
              </div>
              <div className={styles.heroCard}>
                <div className={styles.heroValue}>{stats.totals.overallHighScore}</div>
                <div className={styles.heroLabel}>{t('bestScore') || 'Best Score'}</div>
              </div>
              <div className={styles.heroCard}>
                <div className={styles.heroValue}>{stats.activity.totalGamesLast30Days}</div>
                <div className={styles.heroLabel}>{t('last30Days') || 'Last 30 Days'}</div>
              </div>
            </div>

            <div className={styles.tabs}>
              <button 
                className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                {t('overview') || 'Overview'}
              </button>
              <button 
                className={`${styles.tab} ${activeTab === 'competition' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('competition')}
              >
                {t('competition') || 'Competition'}
              </button>
              <button 
                className={`${styles.tab} ${activeTab === 'demo' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('demo')}
              >
                {t('demo') || 'Demo'}
              </button>
            </div>

            {activeTab === 'overview' && (
              <div className={styles.overviewGrid}>
                <div className={styles.statSection}>
                  <h3 className={styles.sectionTitle}>{t('competitionStats') || 'Competition'}</h3>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t('gamesPlayed') || 'Games Played'}</span>
                    <span className={styles.statValue}>{stats.competition.totalGames}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t('highScore') || 'High Score'}</span>
                    <span className={styles.statValue}>{stats.competition.highScore}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t('avgScore') || 'Avg Score'}</span>
                    <span className={styles.statValue}>{stats.competition.avgScore}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t('eventsJoined') || 'Events Joined'}</span>
                    <span className={styles.statValue}>{stats.competition.eventsParticipated}</span>
                  </div>
                </div>

                <div className={styles.statSection}>
                  <h3 className={styles.sectionTitle}>{t('demoStats') || 'Demo Mode'}</h3>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t('gamesPlayed') || 'Games Played'}</span>
                    <span className={styles.statValue}>{stats.demo.totalGames}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t('highScore') || 'High Score'}</span>
                    <span className={styles.statValue}>{stats.demo.highScore}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t('avgScore') || 'Avg Score'}</span>
                    <span className={styles.statValue}>{stats.demo.avgScore}</span>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'competition' && (
              <div className={styles.tabContent}>
                <div className={styles.statCards}>
                  <div className={styles.miniCard}>
                    <div className={styles.miniValue}>{stats.competition.totalGames}</div>
                    <div className={styles.miniLabel}>{t('games') || 'Games'}</div>
                  </div>
                  <div className={styles.miniCard}>
                    <div className={styles.miniValue}>{stats.competition.highScore}</div>
                    <div className={styles.miniLabel}>{t('best') || 'Best'}</div>
                  </div>
                  <div className={styles.miniCard}>
                    <div className={styles.miniValue}>{stats.competition.avgScore}</div>
                    <div className={styles.miniLabel}>{t('avg') || 'Avg'}</div>
                  </div>
                  <div className={styles.miniCard}>
                    <div className={styles.miniValue}>{stats.competition.eventsParticipated}</div>
                    <div className={styles.miniLabel}>{t('events') || 'Events'}</div>
                  </div>
                </div>

                <h3 className={styles.historyTitle}>{t('recentGames') || 'Recent Games'}</h3>
                {stats.competition.recentGames.length > 0 ? (
                  <div className={styles.gameHistory}>
                    {stats.competition.recentGames.map((game) => (
                      <div key={game.id} className={styles.gameRow}>
                        <div className={styles.gameInfo}>
                          <span className={styles.gameEvent}>Event #{game.eventId}</span>
                          <span className={styles.gameDate}>{formatDate(game.date)}</span>
                        </div>
                        <div className={styles.gameScore}>{game.score}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.noGames}>
                    <p>{t('noCompetitionGames') || 'No competition games yet'}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'demo' && (
              <div className={styles.tabContent}>
                <div className={styles.statCards}>
                  <div className={styles.miniCard}>
                    <div className={styles.miniValue}>{stats.demo.totalGames}</div>
                    <div className={styles.miniLabel}>{t('games') || 'Games'}</div>
                  </div>
                  <div className={styles.miniCard}>
                    <div className={styles.miniValue}>{stats.demo.highScore}</div>
                    <div className={styles.miniLabel}>{t('best') || 'Best'}</div>
                  </div>
                  <div className={styles.miniCard}>
                    <div className={styles.miniValue}>{stats.demo.avgScore}</div>
                    <div className={styles.miniLabel}>{t('avg') || 'Avg'}</div>
                  </div>
                </div>

                <h3 className={styles.historyTitle}>{t('recentGames') || 'Recent Games'}</h3>
                {stats.demo.recentGames.length > 0 ? (
                  <div className={styles.gameHistory}>
                    {stats.demo.recentGames.map((game) => (
                      <div key={game.id} className={styles.gameRow}>
                        <div className={styles.gameInfo}>
                          <span className={styles.gameEvent}>{game.playerName || 'Demo Game'}</span>
                          <span className={styles.gameDate}>{formatDate(game.date)}</span>
                        </div>
                        <div className={styles.gameScore}>{game.score}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.noGames}>
                    <p>{t('noDemoGames') || 'No demo games yet'}</p>
                  </div>
                )}
              </div>
            )}

            {stats.performanceHistory && stats.performanceHistory.length > 0 && (
              <div className={styles.performanceSection}>
                <h3 className={styles.performanceTitle}>Performance History</h3>
                <div className={styles.performanceGraph}>
                  {stats.performanceHistory.slice(0, 20).reverse().map((point, index) => {
                    const maxScore = Math.max(...stats.performanceHistory.map(p => p.score))
                    const heightPercent = maxScore > 0 ? (point.score / maxScore) * 100 : 0
                    return (
                      <div key={index} className={styles.graphBar}>
                        <div 
                          className={`${styles.bar} ${styles[`bar${point.type.charAt(0).toUpperCase() + point.type.slice(1)}`]}`}
                          style={{ height: `${heightPercent}%` }}
                          title={`${point.type}: ${point.score}`}
                        />
                        <div className={styles.barLabel}>{point.score}</div>
                      </div>
                    )
                  })}
                </div>
                <div className={styles.graphLegend}>
                  <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#22c55e' }}></span> Competition</span>
                  <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#3b82f6' }}></span> Demo</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <h2 className={styles.emptyTitle}>{t('noStatsYet') || 'No Stats Yet'}</h2>
            <p className={styles.emptyText}>
              {t('playToSeeStats') || 'Play some games to see your statistics here!'}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

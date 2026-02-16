'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from '../admin.module.css'

interface Event {
  id: number
  startsAt: string
  endsAt: string
  frozen: boolean
}

interface Participant {
  rank: number
  address: string
  totalScore: number
  username: string | null
  isVerified: boolean
}

export default function AdminRounds() {
  const [events, setEvents] = useState<Event[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkSession()
    loadRounds()
  }, [])

  const checkSession = async () => {
    const sessionToken = localStorage.getItem('adminSessionToken')
    if (!sessionToken) {
      router.push('/admin')
      return
    }

    try {
      const res = await fetch('/api/admin/session', {
        headers: { 'x-admin-session': sessionToken },
      })

      if (!res.ok) {
        localStorage.removeItem('adminSessionToken')
        router.push('/admin')
        return
      }

      const data = await res.json()
      setAdminEmail(data.email)
    } catch (err) {
      router.push('/admin')
    }
  }

  const loadRounds = async (eventId?: number) => {
    const sessionToken = localStorage.getItem('adminSessionToken')
    if (!sessionToken) return

    setLoading(true)
    try {
      const url = eventId 
        ? `/api/admin/rounds?eventId=${eventId}`
        : '/api/admin/rounds'
      
      const res = await fetch(url, {
        headers: { 'x-admin-session': sessionToken },
      })

      if (!res.ok) {
        throw new Error('Failed to load rounds')
      }

      const data = await res.json()
      setEvents(data.events)
      setParticipants(data.participants || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load rounds')
    } finally {
      setLoading(false)
    }
  }

  const handleEventSelect = (eventId: number) => {
    setSelectedEventId(eventId)
    loadRounds(eventId)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const exportCSV = () => {
    if (participants.length === 0) return
    
    const headers = ['Rank', 'Username', 'Wallet Address', 'Score', 'Verified']
    const rows = participants.map(p => [
      p.rank,
      p.username || 'N/A',
      p.address,
      p.totalScore,
      p.isVerified ? 'Yes' : 'No'
    ])
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `event-${selectedEventId}-participants.csv`
    a.click()
  }

  return (
    <div className={styles.roundsContainer}>
      <div className={styles.roundsHeader}>
        <div>
          <h1 className={styles.roundsTitle}>Competition Rounds</h1>
          <p className={styles.roundsSubtitle}>View participant wallet addresses (Admin Only)</p>
        </div>
        <div className={styles.roundsNav}>
          <span className={styles.adminEmailLabel}>Logged in as: {adminEmail}</span>
          <Link href="/admin/config" className={styles.backLink}>← Back to Config</Link>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.roundsCard}>
        <h2 className={styles.sectionTitle}>Select Event</h2>
        {loading && !events.length ? (
          <p>Loading events...</p>
        ) : (
          <div className={styles.eventList}>
            {events.map(event => (
              <button
                key={event.id}
                className={`${styles.eventButton} ${selectedEventId === event.id ? styles.selected : ''}`}
                onClick={() => handleEventSelect(event.id)}
              >
                <div className={styles.eventId}>Event #{event.id}</div>
                <div className={styles.eventDates}>
                  {formatDate(event.startsAt)} - {formatDate(event.endsAt)}
                </div>
                <div className={styles.eventStatus}>
                  {event.frozen ? 'Frozen' : new Date(event.endsAt) > new Date() ? 'Active' : 'Ended'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedEventId && (
        <div className={styles.roundsCard}>
          <div className={styles.participantsHeader}>
            <h2 className={styles.sectionTitle}>Participants - Event #{selectedEventId}</h2>
            {participants.length > 0 && (
              <button className={styles.exportBtn} onClick={exportCSV}>
                Export CSV
              </button>
            )}
          </div>
          
          {loading ? (
            <p>Loading participants...</p>
          ) : participants.length === 0 ? (
            <p>No participants found for this event.</p>
          ) : (
            <div className={styles.participantsTable}>
              <div className={styles.tableHeader}>
                <div className={styles.colRank}>Rank</div>
                <div className={styles.colUsername}>Username</div>
                <div className={styles.colAddress}>Wallet Address</div>
                <div className={styles.colScore}>Score</div>
                <div className={styles.colVerified}>Verified</div>
              </div>
              <div className={styles.tableBody}>
                {participants.map(p => (
                  <div key={p.address} className={styles.tableRow}>
                    <div className={styles.colRank}>#{p.rank}</div>
                    <div className={styles.colUsername}>{p.username || 'N/A'}</div>
                    <div className={styles.colAddress}>
                      <code className={styles.addressCode}>{p.address}</code>
                      <button 
                        className={styles.copyBtn}
                        onClick={() => copyToClipboard(p.address)}
                        title="Copy address"
                      >
                        📋
                      </button>
                    </div>
                    <div className={styles.colScore}>{p.totalScore}</div>
                    <div className={styles.colVerified}>
                      {p.isVerified ? '✓' : '✗'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

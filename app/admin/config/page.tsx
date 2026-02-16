'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from '../admin.module.css'

interface Config {
  prizePoolWld: number
  eventDurationSec: number
  cooldownSec?: number
  nextEventStartAt?: string | null
  version: number
  updatedAt?: string
  updatedBy?: string
}

interface ActiveEvent {
  id: number
  startsAt: string
  endsAt: string
  prizePoolWld: string
  status: string
}

interface AuditLog {
  id: number
  action: string
  adminEmail: string
  metadata: string
  ipAddress: string
  createdAt: string
}

export default function AdminConfig() {
  const [config, setConfig] = useState<Config | null>(null)
  const [prizePoolWld, setPrizePoolWld] = useState('')
  const [eventDays, setEventDays] = useState('')
  const [eventHours, setEventHours] = useState('')
  const [eventMinutes, setEventMinutes] = useState('')
  const [cooldownMinutes, setCooldownMinutes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null)
  const [activeEventDays, setActiveEventDays] = useState('')
  const [activeEventHours, setActiveEventHours] = useState('')
  const [activeEventPrizePool, setActiveEventPrizePool] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)
  const [savingPrize, setSavingPrize] = useState(false)
  const [eventError, setEventError] = useState('')
  const [eventSuccess, setEventSuccess] = useState('')
  const [nextEventDate, setNextEventDate] = useState('')
  const [nextEventTime, setNextEventTime] = useState('')
  const router = useRouter()

  // Helper to convert UTC to Eastern time for display
  const utcToEastern = (utcDate: Date): { date: string; time: string } => {
    const eastern = new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const year = eastern.getFullYear()
    const month = String(eastern.getMonth() + 1).padStart(2, '0')
    const day = String(eastern.getDate()).padStart(2, '0')
    const hours = String(eastern.getHours()).padStart(2, '0')
    const minutes = String(eastern.getMinutes()).padStart(2, '0')
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`
    }
  }

  // Helper to convert Eastern time to UTC for storage
  const easternToUtc = (dateStr: string, timeStr: string): Date | null => {
    if (!dateStr || !timeStr) return null
    const easternDateTimeStr = `${dateStr}T${timeStr}:00`
    const easternDate = new Date(easternDateTimeStr + ' EST')
    // Create date in Eastern timezone and convert to UTC
    const options: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York' }
    const formatter = new Intl.DateTimeFormat('en-US', { ...options, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    // Parse the Eastern time properly
    const [month, day, year] = dateStr.split('-').length === 3 
      ? [dateStr.split('-')[1], dateStr.split('-')[2], dateStr.split('-')[0]]
      : ['01', '01', '2025']
    const [hour, minute] = timeStr.split(':')
    const utcDate = new Date(Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour) + 5, // EST is UTC-5 (rough, DST not handled)
      parseInt(minute)
    ))
    return utcDate
  }

  useEffect(() => {
    checkSession()
    loadConfig()
    loadActiveEvent()
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

  const loadConfig = async () => {
    const sessionToken = localStorage.getItem('adminSessionToken')
    if (!sessionToken) return

    try {
      const res = await fetch('/api/admin/config', {
        headers: { 'x-admin-session': sessionToken },
      })

      if (!res.ok) throw new Error('Failed to load config')

      const data = await res.json()
      setConfig(data)
      setPrizePoolWld(data.prizePoolWld.toString())
      
      const days = Math.floor(data.eventDurationSec / (24 * 60 * 60))
      const hours = Math.floor((data.eventDurationSec % (24 * 60 * 60)) / (60 * 60))
      const minutes = Math.floor((data.eventDurationSec % (60 * 60)) / 60)
      setEventDays(days.toString())
      setEventHours(hours.toString())
      setEventMinutes(minutes.toString())
      
      // Parse cooldown
      const cooldownMins = Math.floor((data.cooldownSec || 600) / 60)
      setCooldownMinutes(cooldownMins.toString())

      // Parse next event start time if set
      if (data.nextEventStartAt) {
        const utcDate = new Date(data.nextEventStartAt)
        const eastern = utcToEastern(utcDate)
        setNextEventDate(eastern.date)
        setNextEventTime(eastern.time)
      }
    } catch (err) {
      setError('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const loadActiveEvent = async () => {
    try {
      const res = await fetch('/api/event/current')
      if (!res.ok) return

      const data = await res.json()
      if (data.eventId) {
        const startsAt = new Date(data.startsAt)
        const endsAt = new Date(data.endsAt)
        const durationMs = endsAt.getTime() - startsAt.getTime()
        const durationSec = Math.floor(durationMs / 1000)
        const days = Math.floor(durationSec / (24 * 60 * 60))
        const hours = Math.floor((durationSec % (24 * 60 * 60)) / (60 * 60))

        setActiveEvent({
          id: data.eventId,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          prizePoolWld: data.prizePoolWld,
          status: data.status,
        })
        setActiveEventDays(days.toString())
        setActiveEventHours(hours.toString())
        setActiveEventPrizePool(data.prizePoolWld || '')
      }
    } catch (err) {
      console.error('Failed to load active event:', err)
    }
  }

  const handleUpdateEventDuration = async (e: React.FormEvent) => {
    e.preventDefault()
    setEventError('')
    setEventSuccess('')
    setSavingEvent(true)

    const sessionToken = localStorage.getItem('adminSessionToken')
    if (!sessionToken || !activeEvent) {
      setSavingEvent(false)
      return
    }

    try {
      const days = parseInt(activeEventDays) || 0
      const hours = parseInt(activeEventHours) || 0

      if (days === 0 && hours === 0) {
        setEventError('Duration must be at least 1 hour')
        return
      }

      const res = await fetch('/api/admin/events/update-duration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-session': sessionToken,
        },
        body: JSON.stringify({
          eventId: activeEvent.id,
          durationDays: days,
          durationHours: hours,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update event duration')
      }

      const data = await res.json()
      setEventSuccess(`Event updated! New end: ${new Date(data.newEndsAt).toLocaleString()}`)
      loadActiveEvent()
    } catch (err: any) {
      setEventError(err.message || 'Failed to update event duration')
    } finally {
      setSavingEvent(false)
    }
  }

  const handleUpdateEventPrize = async (e: React.FormEvent) => {
    e.preventDefault()
    setEventError('')
    setEventSuccess('')
    setSavingPrize(true)

    const sessionToken = localStorage.getItem('adminSessionToken')
    if (!sessionToken || !activeEvent) {
      setSavingPrize(false)
      return
    }

    try {
      const prizePool = parseFloat(activeEventPrizePool)
      
      if (isNaN(prizePool) || prizePool < 0.5 || prizePool > 100000) {
        setEventError('Prize pool must be between 0.5 and 100,000 WLD')
        return
      }

      if (prizePool % 0.5 !== 0) {
        setEventError('Prize pool must be a multiple of 0.5')
        return
      }

      const res = await fetch('/api/admin/events/update-prize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-session': sessionToken,
        },
        body: JSON.stringify({
          eventId: activeEvent.id,
          prizePoolWld: prizePool,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update prize pool')
      }

      const data = await res.json()
      setEventSuccess(`Prize pool updated to ${data.prizePoolWld} WLD!`)
      loadActiveEvent()
    } catch (err: any) {
      setEventError(err.message || 'Failed to update prize pool')
    } finally {
      setSavingPrize(false)
    }
  }

  const loadAuditLogs = async () => {
    const sessionToken = localStorage.getItem('adminSessionToken')
    if (!sessionToken) return

    try {
      const res = await fetch('/api/admin/audit', {
        headers: { 'x-admin-session': sessionToken },
      })

      if (!res.ok) throw new Error('Failed to load audit logs')

      const data = await res.json()
      setAuditLogs(data.logs)
      setShowAudit(true)
    } catch (err) {
      setError('Failed to load audit logs')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    const sessionToken = localStorage.getItem('adminSessionToken')
    if (!sessionToken) {
      router.push('/admin')
      return
    }

    try {
      const prizePool = parseFloat(prizePoolWld)
      const days = parseInt(eventDays) || 0
      const hours = parseInt(eventHours) || 0
      const mins = parseInt(eventMinutes) || 0
      const eventDurationSec = days * 24 * 60 * 60 + hours * 60 * 60 + mins * 60
      const cooldownSec = (parseInt(cooldownMinutes) || 10) * 60

      if (prizePool < 0.5 || prizePool > 100000) {
        setError('Prize pool must be between 0.5 and 100,000 WLD')
        return
      }

      if (prizePool % 0.5 !== 0) {
        setError('Prize pool must be a multiple of 0.5')
        return
      }

      if (eventDurationSec < 60) {
        setError('Event duration must be at least 1 minute')
        return
      }

      // Calculate UTC time from Eastern time inputs
      let nextEventStartAtUtc: string | null = null
      if (nextEventDate && nextEventTime) {
        // Parse Eastern time and convert to UTC
        const [year, month, day] = nextEventDate.split('-').map(Number)
        const [hour, minute] = nextEventTime.split(':').map(Number)
        
        // Create a date string in ISO format for Eastern time
        const easternStr = `${nextEventDate}T${nextEventTime}:00`
        
        // Use Intl to properly convert Eastern to UTC
        const easternDate = new Date(easternStr)
        // Adjust for Eastern timezone (EST = UTC-5, EDT = UTC-4)
        // Check if date is in DST
        const jan = new Date(year, 0, 1)
        const jul = new Date(year, 6, 1)
        const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())
        const isDst = easternDate.getTimezoneOffset() < stdOffset
        const offsetHours = isDst ? 4 : 5
        
        const utcDate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute))
        nextEventStartAtUtc = utcDate.toISOString()
      }

      const res = await fetch('/api/admin/config/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-session': sessionToken,
        },
        body: JSON.stringify({
          prizePoolWld: prizePool,
          eventDurationSec,
          cooldownSec,
          nextEventStartAt: nextEventStartAtUtc,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update config')
      }

      const data = await res.json()
      setSuccess(`Prize pool updated to ${data.prizePoolWld} WLD`)
      loadConfig()
    } catch (err: any) {
      setError(err.message || 'Failed to update configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('adminSessionToken')
    router.push('/admin')
  }

  if (loading) {
    return (
      <div className={styles.configContainer}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={styles.configContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>Back to App</Link>
          <h1 className={styles.headerTitle}>Admin</h1>
        </div>
        <div>
          <Link href="/admin/rounds" className={styles.navLink}>View Rounds</Link>
          <span className={styles.adminEmail}>{adminEmail}</span>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            Sign Out
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Global Settings</h2>
          <form onSubmit={handleSave}>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Prize Pool (WLD)</label>
                <input
                  type="number"
                  value={prizePoolWld}
                  onChange={(e) => setPrizePoolWld(e.target.value)}
                  step="0.5"
                  min="0.5"
                  max="100000"
                  className={styles.input}
                  required
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Event Duration - Days</label>
                <input
                  type="number"
                  value={eventDays}
                  onChange={(e) => setEventDays(e.target.value)}
                  min="0"
                  max="30"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Hours</label>
                <input
                  type="number"
                  value={eventHours}
                  onChange={(e) => setEventHours(e.target.value)}
                  min="0"
                  max="23"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Minutes</label>
                <input
                  type="number"
                  value={eventMinutes}
                  onChange={(e) => setEventMinutes(e.target.value)}
                  min="0"
                  max="59"
                  className={styles.input}
                />
              </div>
            </div>
            <div className={styles.row} style={{ marginTop: '16px' }}>
              <div className={styles.field}>
                <label className={styles.label}>Cooldown Between Events (Minutes)</label>
                <input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(e.target.value)}
                  min="1"
                  max="1440"
                  className={styles.input}
                />
                <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                  Time between events ending and new event starting
                </p>
              </div>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#475569' }}>
                Next Event Start Time (Eastern Time)
              </h3>
              <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
                Schedule when the next event should start. Leave empty for automatic start after cooldown.
              </p>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Date (ET)</label>
                  <input
                    type="date"
                    value={nextEventDate}
                    onChange={(e) => setNextEventDate(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Time (ET)</label>
                  <input
                    type="time"
                    value={nextEventTime}
                    onChange={(e) => setNextEventTime(e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>
              {(nextEventDate || nextEventTime) && (
                <button 
                  type="button" 
                  onClick={() => { setNextEventDate(''); setNextEventTime(''); }}
                  style={{ 
                    marginTop: '8px', 
                    padding: '6px 12px', 
                    fontSize: '12px', 
                    background: '#FEE2E2', 
                    color: '#DC2626', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer' 
                  }}
                >
                  Clear Scheduled Time
                </button>
              )}
            </div>

            <button type="submit" disabled={saving} className={styles.button} style={{ marginTop: '16px' }}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
          {config && (
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '16px' }}>
              <p>Version {config.version} | Last updated: {config.updatedAt ? new Date(config.updatedAt).toLocaleString() : 'Never'}</p>
              {config.nextEventStartAt && (
                <p style={{ marginTop: '8px', color: '#059669', fontWeight: 500 }}>
                  Next event scheduled: {new Date(config.nextEventStartAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
                </p>
              )}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Current Event</h2>
          {eventError && <div className={styles.error}>{eventError}</div>}
          {eventSuccess && <div className={styles.success}>{eventSuccess}</div>}
          
          {activeEvent ? (
            <>
              <div className={styles.row}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Event ID</span>
                  <span className={styles.infoValue}>{activeEvent.id}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Status</span>
                  <span className={activeEvent.status === 'active' ? styles.statusActive : styles.statusEnded}>
                    {activeEvent.status}
                  </span>
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Started</span>
                  <span className={styles.infoValue}>{new Date(activeEvent.startsAt).toLocaleString()}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Ends</span>
                  <span className={styles.infoValue}>{new Date(activeEvent.endsAt).toLocaleString()}</span>
                </div>
              </div>
              <form onSubmit={handleUpdateEventPrize} style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '12px' }}>Update current event prize pool:</p>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Prize Pool (WLD)</label>
                    <input
                      type="number"
                      value={activeEventPrizePool}
                      onChange={(e) => setActiveEventPrizePool(e.target.value)}
                      step="0.5"
                      min="0.5"
                      max="100000"
                      className={styles.smallInput}
                      style={{ width: '120px' }}
                    />
                  </div>
                  <button type="submit" disabled={savingPrize} className={styles.smallBtn}>
                    {savingPrize ? 'Updating...' : 'Update Prize'}
                  </button>
                </div>
              </form>

              <form onSubmit={handleUpdateEventDuration} style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '12px' }}>Adjust event end time:</p>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Days</label>
                    <input
                      type="number"
                      value={activeEventDays}
                      onChange={(e) => setActiveEventDays(e.target.value)}
                      min="0"
                      max="30"
                      className={styles.smallInput}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Hours</label>
                    <input
                      type="number"
                      value={activeEventHours}
                      onChange={(e) => setActiveEventHours(e.target.value)}
                      min="0"
                      max="23"
                      className={styles.smallInput}
                    />
                  </div>
                  <button type="submit" disabled={savingEvent} className={styles.smallBtn}>
                    {savingEvent ? 'Updating...' : 'Update'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p style={{ color: '#64748B', textAlign: 'center', padding: '24px' }}>No active event</p>
          )}
        </div>

        <div className={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>Activity Log</h2>
            <button onClick={loadAuditLogs} className={styles.toggleBtn}>
              {showAudit ? 'Refresh' : 'Load'}
            </button>
          </div>

          {showAudit && (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {auditLogs.length > 0 ? (
                <table className={styles.auditTable}>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Admin</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.action}</td>
                        <td>{log.adminEmail}</td>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#64748B', textAlign: 'center', padding: '24px' }}>No activity yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

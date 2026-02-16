'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useSession } from '../contexts/SessionContext'
import styles from './advertise.module.css'

interface ActiveBid {
  id: number
  appName: string
  appLogo: string | null
  bidAmountWld: string
  status: string
}

export default function AdvertisePage() {
  const router = useRouter()
  const { session } = useSession()
  
  const [formData, setFormData] = useState({
    appName: '',
    appUrl: '',
    appLogo: '',
    contactEmail: '',
    adTitle: '',
    adDescription: '',
    bidAmountWld: '5',
    durationDays: 7,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeBids, setActiveBids] = useState<ActiveBid[]>([])
  const [loadingBids, setLoadingBids] = useState(true)

  useEffect(() => {
    fetchActiveBids()
  }, [])

  const fetchActiveBids = async () => {
    try {
      const response = await fetch('/api/ads/bid?status=approved')
      if (response.ok) {
        const data = await response.json()
        setActiveBids(data.bids?.slice(0, 3) || [])
      }
    } catch (err) {
      console.error('Error fetching bids:', err)
    } finally {
      setLoadingBids(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const response = await fetch('/api/ads/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          contactWallet: session?.address,
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit')
      }

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className={styles.container}>
        <TopBar title="Advertise" showBack />
        <main className={styles.main}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.successTitle}>Bid Submitted!</h2>
            <p className={styles.successText}>
              We'll review your submission and contact you at {formData.contactEmail} within 24-48 hours.
            </p>
            <button 
              className={styles.primaryButton}
              onClick={() => router.push('/')}
            >
              Back to Home
            </button>
          </div>
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <TopBar title="Advertise" showBack />
      
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Get Your App Seen</h1>
          <p className={styles.subtitle}>
            PrizeFi players watch your ad to earn free plays. You get exposure to engaged World App users.
          </p>
        </div>

        <div className={styles.howItWorks}>
          <h3 className={styles.sectionTitle}>How It Works</h3>
          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepNumber}>1</span>
              <span className={styles.stepText}>Submit your mini-app details</span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNumber}>2</span>
              <span className={styles.stepText}>We review and approve your ad</span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNumber}>3</span>
              <span className={styles.stepText}>Players visit your app for free plays</span>
            </div>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>50K+</span>
            <span className={styles.statLabel}>Users</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>500K+</span>
            <span className={styles.statLabel}>Views/mo</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>85%</span>
            <span className={styles.statLabel}>Verified</span>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <h3 className={styles.sectionTitle}>Your Mini-App</h3>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>App Name *</label>
            <input
              type="text"
              name="appName"
              value={formData.appName}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Your app name"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>App URL *</label>
            <input
              type="url"
              name="appUrl"
              value={formData.appUrl}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="https://..."
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>What players will see *</label>
            <input
              type="text"
              name="adTitle"
              value={formData.adTitle}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="e.g., Try our token swap app!"
              maxLength={60}
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Bid (WLD) *</label>
              <input
                type="number"
                name="bidAmountWld"
                value={formData.bidAmountWld}
                onChange={handleInputChange}
                className={styles.input}
                min="1"
                step="1"
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Duration</label>
              <select
                name="durationDays"
                value={formData.durationDays}
                onChange={handleInputChange}
                className={styles.select}
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Contact Email *</label>
            <input
              type="email"
              name="contactEmail"
              value={formData.contactEmail}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="you@example.com"
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button 
            type="submit" 
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Bid'}
          </button>

          <p className={styles.disclaimer}>
            Higher bids get priority. Payment collected after approval.
          </p>
        </form>
      </main>

      <BottomNav />
    </div>
  )
}

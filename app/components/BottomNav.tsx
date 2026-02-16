'use client'

import { usePathname, useRouter } from 'next/navigation'
import { MiniKit } from "@worldcoin/minikit-js"
import { useLanguage } from '../contexts/LanguageContext'
import { sounds } from '@/lib/sounds'
import styles from './BottomNav.module.css'

const hapticTap = () => {
  try {
    if (MiniKit.isInstalled() && MiniKit.commandsAsync?.sendHapticFeedback) {
      MiniKit.commandsAsync.sendHapticFeedback({ hapticsType: 'selection-changed' }).catch(() => {});
    } else {
      navigator?.vibrate?.(10);
    }
  } catch {}
}

const PlayIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" className={styles.icon}>
    <rect x="6" y="4" width="4" height="4" fill={active ? "#4ADE80" : "#22C55E"} />
    <rect x="6" y="8" width="4" height="4" fill={active ? "#22C55E" : "#16A34A"} />
    <rect x="6" y="12" width="4" height="4" fill={active ? "#22C55E" : "#16A34A"} />
    <rect x="6" y="16" width="4" height="4" fill={active ? "#16A34A" : "#15803D"} />
    <rect x="10" y="6" width="4" height="4" fill={active ? "#4ADE80" : "#22C55E"} />
    <rect x="10" y="10" width="4" height="4" fill={active ? "#22C55E" : "#16A34A"} />
    <rect x="10" y="14" width="4" height="4" fill={active ? "#16A34A" : "#15803D"} />
    <rect x="14" y="8" width="4" height="4" fill={active ? "#4ADE80" : "#22C55E"} />
    <rect x="14" y="12" width="4" height="4" fill={active ? "#22C55E" : "#16A34A"} />
    <rect x="18" y="10" width="4" height="4" fill={active ? "#4ADE80" : "#22C55E"} />
  </svg>
)

const TrophyIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" className={styles.icon}>
    <rect x="6" y="2" width="12" height="2" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="4" y="4" width="4" height="2" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="16" y="4" width="4" height="2" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="6" y="4" width="12" height="8" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="8" y="6" width="4" height="2" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="2" y="6" width="2" height="4" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="20" y="6" width="2" height="4" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="8" y="12" width="8" height="2" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="10" y="14" width="4" height="4" fill={active ? "#D97706" : "#B45309"} />
    <rect x="6" y="18" width="12" height="2" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="4" y="20" width="16" height="2" fill={active ? "#D97706" : "#B45309"} />
  </svg>
)

const StatsIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" className={styles.icon}>
    <rect x="2" y="16" width="4" height="6" fill={active ? "#60A5FA" : "#3B82F6"} />
    <rect x="8" y="10" width="4" height="12" fill={active ? "#3B82F6" : "#2563EB"} />
    <rect x="14" y="6" width="4" height="16" fill={active ? "#2563EB" : "#1D4ED8"} />
    <rect x="20" y="2" width="2" height="20" fill={active ? "#3B82F6" : "#2563EB"} />
    <rect x="2" y="14" width="4" height="2" fill={active ? "#93C5FD" : "#60A5FA"} />
    <rect x="8" y="8" width="4" height="2" fill={active ? "#93C5FD" : "#60A5FA"} />
    <rect x="14" y="4" width="4" height="2" fill={active ? "#93C5FD" : "#60A5FA"} />
  </svg>
)

const SettingsIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" className={styles.icon}>
    <rect x="10" y="2" width="4" height="4" fill={active ? "#A78BFA" : "#8B5CF6"} />
    <rect x="10" y="18" width="4" height="4" fill={active ? "#A78BFA" : "#8B5CF6"} />
    <rect x="2" y="10" width="4" height="4" fill={active ? "#A78BFA" : "#8B5CF6"} />
    <rect x="18" y="10" width="4" height="4" fill={active ? "#A78BFA" : "#8B5CF6"} />
    <rect x="4" y="4" width="4" height="4" fill={active ? "#C4B5FD" : "#A78BFA"} />
    <rect x="16" y="4" width="4" height="4" fill={active ? "#C4B5FD" : "#A78BFA"} />
    <rect x="4" y="16" width="4" height="4" fill={active ? "#C4B5FD" : "#A78BFA"} />
    <rect x="16" y="16" width="4" height="4" fill={active ? "#C4B5FD" : "#A78BFA"} />
    <rect x="6" y="6" width="12" height="12" fill={active ? "#A78BFA" : "#8B5CF6"} />
    <rect x="8" y="8" width="8" height="8" fill={active ? "#C4B5FD" : "#A78BFA"} />
    <rect x="10" y="10" width="4" height="4" fill={active ? "#7C3AED" : "#6D28D9"} />
  </svg>
)

const CrownIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" className={styles.icon}>
    <rect x="2" y="8" width="4" height="4" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="18" y="8" width="4" height="4" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="10" y="4" width="4" height="4" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="4" y="10" width="4" height="4" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="16" y="10" width="4" height="4" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="8" y="8" width="4" height="4" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="12" y="8" width="4" height="4" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="4" y="14" width="16" height="4" fill={active ? "#FBBF24" : "#F59E0B"} />
    <rect x="4" y="18" width="16" height="2" fill={active ? "#D97706" : "#B45309"} />
    <rect x="6" y="10" width="2" height="2" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="16" y="10" width="2" height="2" fill={active ? "#FDE047" : "#FBBF24"} />
    <rect x="11" y="6" width="2" height="2" fill={active ? "#FDE047" : "#FBBF24"} />
  </svg>
)

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  
  const isActive = (path: string) => pathname === path || (path === '/flash' && pathname?.startsWith('/flash'))

  const handleNavClick = (path: string) => {
    if (pathname !== path) {
      hapticTap()
      sounds.buttonPress()
    }
    router.push(path)
  }

  return (
    <nav className={`${styles.bottomNav} bottom-nav-fixed`}>
      <button
        className={`${styles.navItem} ${isActive('/') ? styles.active : ''}`}
        onClick={() => handleNavClick('/')}
      >
        <PlayIcon active={isActive('/')} />
        <span className={styles.label}>{t('play')}</span>
      </button>
      <button
        className={`${styles.navItem} ${isActive('/leaderboard') ? styles.active : ''}`}
        onClick={() => handleNavClick('/leaderboard')}
      >
        <TrophyIcon active={isActive('/leaderboard')} />
        <span className={styles.label}>{t('leaderboard')}</span>
      </button>
      <button
        className={`${styles.navItem} ${isActive('/special') ? styles.active : ''}`}
        onClick={() => handleNavClick('/special')}
      >
        <CrownIcon active={isActive('/special')} />
        <span className={styles.label}>{t('special') || 'Special'}</span>
      </button>
      <button
        className={`${styles.navItem} ${isActive('/settings') ? styles.active : ''}`}
        onClick={() => handleNavClick('/settings')}
      >
        <SettingsIcon active={isActive('/settings')} />
        <span className={styles.label}>{t('settings')}</span>
      </button>
    </nav>
  )
}

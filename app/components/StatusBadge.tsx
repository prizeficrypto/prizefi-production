'use client'

import { useLanguage } from '../contexts/LanguageContext'
import styles from './StatusBadge.module.css'

interface StatusBadgeProps {
  isVerified: boolean
}

export default function StatusBadge({ isVerified }: StatusBadgeProps) {
  const { t } = useLanguage()
  
  return (
    <span className={`${styles.badge} ${isVerified ? styles.verified : styles.unverified}`}>
      {isVerified ? t('verified') : t('notVerified')}
    </span>
  )
}

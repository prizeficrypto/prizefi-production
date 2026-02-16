'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './TopBar.module.css'

interface TopBarProps {
  title: string
  showSettings?: boolean
  showBack?: boolean
}

export default function TopBar({ title, showSettings = false, showBack = false }: TopBarProps) {
  const router = useRouter()
  const { t } = useLanguage()

  return (
    <div className={styles.topbar}>
      <div className={styles.left}>
        {showBack && (
          <button onClick={() => router.back()} className={styles.backBtn}>
            ← {t('back')}
          </button>
        )}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.right}>
        {showSettings && (
          <button onClick={() => router.push('/settings')} className={styles.settingsBtn}>
            {t('settings')}
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { useLanguage } from '../contexts/LanguageContext'
import styles from './RulesScreen.module.css'

interface RulesScreenProps {
  onBack: () => void
}

export default function RulesScreen({ onBack }: RulesScreenProps) {
  const { t } = useLanguage()

  const competitionSteps = [
    t('competitionStep1'),
    t('competitionStep2'),
    t('competitionStep3'),
    t('competitionStep4'),
  ]

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('howCompetitionWorks')}</h1>
        
        <div className={styles.section}>
          <ul className={styles.rulesList}>
            {competitionSteps.map((step, idx) => (
              <li key={idx} className={styles.rule}>
                <span className={styles.bullet}>{idx + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.section}>
          <div className={styles.importantNote}>
            <p>{t('noRetries')}</p>
            <p>{t('weeklyReset')}</p>
            <p>{t('rule6')}</p>
          </div>
        </div>

        <button className="btn btn-primary" onClick={onBack}>
          {t('back')}
        </button>
      </div>
    </div>
  )
}

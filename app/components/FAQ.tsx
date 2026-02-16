'use client'

import { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { TranslationKey } from '../lib/i18n'
import styles from './FAQ.module.css'

interface FAQItem {
  questionKey: TranslationKey
  answerKey: TranslationKey
}

const faqItems: FAQItem[] = [
  { questionKey: 'faqQ1', answerKey: 'faqA1' },
  { questionKey: 'faqQ2', answerKey: 'faqA2' },
  { questionKey: 'faqQ3', answerKey: 'faqA3' },
  { questionKey: 'faqQ4', answerKey: 'faqA4' },
  { questionKey: 'faqQ5', answerKey: 'faqA5' },
]

export default function FAQ() {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
  const { t } = useLanguage()

  const toggleItem = (index: number) => {
    setExpandedItem(expandedItem === index ? null : index)
  }

  return (
    <div className={styles.container}>
      <button 
        className={styles.toggle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{t('faqTitle')}</span>
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div className={styles.content}>
          {faqItems.map((item, index) => (
            <div key={index} className={styles.faqItem}>
              <button 
                className={styles.question}
                onClick={() => toggleItem(index)}
              >
                <span>{t(item.questionKey)}</span>
                <span className={styles.itemArrow}>{expandedItem === index ? '−' : '+'}</span>
              </button>
              {expandedItem === index && (
                <div className={styles.answer}>
                  <p>{t(item.answerKey)}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

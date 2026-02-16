'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './Tutorial.module.css'

interface TutorialProps {
  onComplete: () => void
}

export default function Tutorial({ onComplete }: TutorialProps) {
  const { t } = useLanguage()
  const [currentScreen, setCurrentScreen] = useState(0)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('bitplay_tutorial_seen')
    if (!hasSeenTutorial) {
      setShow(true)
    } else {
      onComplete()
    }
  }, [onComplete])

  const handleNext = () => {
    if (currentScreen < 2) {
      setCurrentScreen(currentScreen + 1)
    } else {
      handleComplete()
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    localStorage.setItem('bitplay_tutorial_seen', 'true')
    setShow(false)
    onComplete()
  }

  if (!show) {
    return null
  }

  const screens = [
    {
      title: t('tutorial1Title'),
      text: t('tutorial1Text'),
      emoji: '🎮'
    },
    {
      title: t('tutorial2Title'),
      text: t('tutorial2Text'),
      emoji: '⚡'
    },
    {
      title: t('tutorial3Title'),
      text: t('tutorial3Text'),
      emoji: '💰'
    }
  ]

  const screen = screens[currentScreen]

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.progress}>
          {screens.map((_, index) => (
            <div
              key={index}
              className={`${styles.dot} ${index === currentScreen ? styles.active : ''} ${index < currentScreen ? styles.completed : ''}`}
            />
          ))}
        </div>

        <div className={styles.content}>
          <div className={styles.emoji}>{screen.emoji}</div>
          <h2 className={styles.title}>{screen.title}</h2>
          <p className={styles.text}>{screen.text}</p>
        </div>

        <div className={styles.buttons}>
          <button className="btn btn-secondary" onClick={handleSkip}>
            {t('tutorialSkip')}
          </button>
          <button className="btn btn-primary" onClick={handleNext}>
            {currentScreen < 2 ? t('tutorialNext') : t('tutorialGetStarted')}
          </button>
        </div>
      </div>
    </div>
  )
}

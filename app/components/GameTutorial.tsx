'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { Language } from '../lib/i18n'
import { useTheme } from '../contexts/ThemeContext'
import { useSession } from '../contexts/SessionContext'
import { startSessionReal } from '../lib/minikit'
import styles from './GameTutorial.module.css'

interface GameTutorialProps {
  onComplete: () => void
}

const TUTORIAL_KEY = 'prizefi_game_tutorial_v9'

export function useGameTutorial() {
  const [needsTutorial, setNeedsTutorial] = useState<boolean | null>(null)
  
  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = localStorage.getItem(TUTORIAL_KEY)
    setNeedsTutorial(!seen)
  }, [])
  
  const markComplete = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TUTORIAL_KEY, 'true')
    }
    setNeedsTutorial(false)
  }, [])
  
  const reset = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TUTORIAL_KEY)
    }
    setNeedsTutorial(true)
  }, [])
  
  return { needsTutorial, markComplete, reset }
}

const NON_LATIN_LANGS = ['ja', 'ko', 'th', 'hi']

const languages: { code: Language; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
  { code: 'fr', native: 'Français' },
  { code: 'de', native: 'Deutsch' },
  { code: 'pt', native: 'Português' },
  { code: 'id', native: 'Indonesia' },
  { code: 'ms', native: 'Melayu' },
  { code: 'fil', native: 'Filipino' },
  { code: 'pl', native: 'Polski' },
  { code: 'ja', native: '日本語' },
  { code: 'ko', native: '한국어' },
  { code: 'th', native: 'ไทย' },
  { code: 'hi', native: 'हिंदी' },
]

export default function GameTutorial({ onComplete }: GameTutorialProps) {
  const { t, language, setLanguage } = useLanguage()
  const { colors } = useTheme()
  const { session, setSession } = useSession()
  const [step, setStep] = useState(0)
  const [selectedLang, setSelectedLang] = useState<Language>(language)
  
  useEffect(() => {
    document.body.setAttribute('data-lang', language)
    return () => document.body.removeAttribute('data-lang')
  }, [language])

  const [dotAngle, setDotAngle] = useState(0)
  const [showTapHint, setShowTapHint] = useState(false)
  const [showHitEffect, setShowHitEffect] = useState(false)
  const [tapCount, setTapCount] = useState(0)
  const [isAnimating, setIsAnimating] = useState(true)
  const [speed, setSpeed] = useState(1.0)  // Match PrecisionTapGame starting speed
  const [targetAngle, setTargetAngle] = useState(Math.PI / 2)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const speedRef = useRef(1.0)  // Match PrecisionTapGame starting speed
  const targetAngleRef = useRef(Math.PI / 2)
  const directionRef = useRef<1 | -1>(1)
  const dotAngleRef = useRef(0)
  const dotRef = useRef<SVGCircleElement>(null)
  const arcRef = useRef<SVGPathElement>(null)
  const prevInZoneRef = useRef(false)
  
  // Match PrecisionTapGame constants for consistent experience
  const CENTER = 150
  const RING_RADIUS = 120
  const RING_STROKE = 16
  const ORBIT_RADIUS = RING_RADIUS
  const TARGET_BASE_ARC = Math.PI / 6  // 30 degrees (same as game)
  const TARGET_ARC = TARGET_BASE_ARC * 1.5  // 1.5x window (same as game)
  
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  
  useEffect(() => {
    targetAngleRef.current = targetAngle
  }, [targetAngle])

  useEffect(() => {
    directionRef.current = direction
  }, [direction])
  
  useEffect(() => {
    if (step === 2 && isAnimating) {
      lastTimeRef.current = 0
      dotAngleRef.current = dotAngle
      
      const animate = (time: number) => {
        if (!lastTimeRef.current) lastTimeRef.current = time
        const delta = (time - lastTimeRef.current) / 1000
        lastTimeRef.current = time
        
        let newAngle = dotAngleRef.current + delta * speedRef.current * directionRef.current
        if (newAngle > Math.PI * 2) newAngle -= Math.PI * 2
        if (newAngle < 0) newAngle += Math.PI * 2
        dotAngleRef.current = newAngle
        
        if (dotRef.current) {
          const dotX = CENTER + ORBIT_RADIUS * Math.cos(newAngle)
          const dotY = CENTER + ORBIT_RADIUS * Math.sin(newAngle)
          dotRef.current.setAttribute('cx', String(dotX))
          dotRef.current.setAttribute('cy', String(dotY))
        }
        
        const diff = Math.abs(newAngle - targetAngleRef.current)
        const inZone = diff < TARGET_ARC / 2 || diff > Math.PI * 2 - TARGET_ARC / 2
        
        if (inZone !== prevInZoneRef.current) {
          prevInZoneRef.current = inZone
          setShowTapHint(inZone)
        }
        
        rafRef.current = requestAnimationFrame(animate)
      }
      
      rafRef.current = requestAnimationFrame(animate)
      
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    }
  }, [step, isAnimating, dotAngle])
  
  const handleDemoTap = useCallback(() => {
    if (step !== 2) return
    
    const diff = Math.abs(dotAngleRef.current - targetAngle)
    const inZone = diff < TARGET_ARC / 2 || diff > Math.PI * 2 - TARGET_ARC / 2
    
    if (inZone) {
      setShowHitEffect(true)
      const newTapCount = tapCount + 1
      setTapCount(newTapCount)
      try { navigator?.vibrate?.([20, 30, 40]) } catch {}
      setTimeout(() => setShowHitEffect(false), 200)
      
      if (newTapCount >= 3) {
        setTimeout(() => setStep(3), 500)
      } else {
        setSpeed(prev => prev + 0.3125)  // Match PrecisionTapGame SPEED_INCREMENT
        setTargetAngle(Math.random() * Math.PI * 2)
        setDirection(prev => (prev === 1 ? -1 : 1) as 1 | -1)
      }
    } else {
      try { navigator?.vibrate?.([10, 30, 10]) } catch {}
    }
  }, [step, targetAngle, tapCount])

  const handleLanguageSelect = (lang: Language) => {
    setSelectedLang(lang)
    setLanguage(lang)
  }
  
  const handleConnect = async () => {
    setConnecting(true)
    setConnectionError(null)
    try {
      const sessionData = await startSessionReal()
      setSession(sessionData)
      setConnected(true)
      
      if (sessionData.username && sessionData.address) {
        try {
          await fetch('/api/profile/username', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-wallet': sessionData.address
            },
            body: JSON.stringify({
              walletAddress: sessionData.address,
              username: sessionData.username
            })
          })
        } catch (err) {
          console.log('Could not store username:', err)
        }
      }
    } catch (err: any) {
      console.error('Connection error:', err)
      setConnectionError(err?.message || 'Connection failed. Please try again.')
    } finally {
      setConnecting(false)
    }
  }
  
  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1)
      if (step === 1) {
        setTapCount(0)
        lastTimeRef.current = 0
      }
    } else {
      onComplete()
    }
  }
  
  const dotX = CENTER + ORBIT_RADIUS * Math.cos(dotAngle)
  const dotY = CENTER + ORBIT_RADIUS * Math.sin(dotAngle)
  
  const arcStart = targetAngle - TARGET_ARC / 2
  const arcEnd = targetAngle + TARGET_ARC / 2
  const arcStartX = CENTER + ORBIT_RADIUS * Math.cos(arcStart)
  const arcStartY = CENTER + ORBIT_RADIUS * Math.sin(arcStart)
  const arcEndX = CENTER + ORBIT_RADIUS * Math.cos(arcEnd)
  const arcEndY = CENTER + ORBIT_RADIUS * Math.sin(arcEnd)

  const PixelCheckmark = ({ size = 32 }: { size?: number }) => (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none"
      style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
    >
      <rect x="4" y="4" width="24" height="24" fill="#22c55e" stroke="#000" strokeWidth="3"/>
      <polyline 
        points="10,16 14,20 22,12" 
        stroke="#fff" 
        strokeWidth="3" 
        strokeLinecap="butt" 
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  )

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.header}>
        </div>
        
        <div className={styles.content}>
          {step === 0 && (
            <>
              <div className={styles.welcomeTrophy}>🏆</div>
              <h1 className={styles.welcomeTitle}>Welcome to</h1>
              <h1 className={styles.appName}>PrizeFi</h1>
              <p className={styles.welcomeSubtitle}>{t('tagline')}</p>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className={styles.title}>{t('selectLanguage')}</h1>
              <div className={styles.languageGrid}>
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    className={`${styles.langButton} ${selectedLang === lang.code ? styles.selected : ''}`}
                    onClick={() => handleLanguageSelect(lang.code)}
                  >
                    <span className={`${styles.langNative} ${NON_LATIN_LANGS.includes(lang.code) ? styles.nonLatin : ''}`}>
                      {lang.native}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className={styles.title}>{t('tutorialTitle3')}</h1>
              <p className={styles.subtitle}>{t('tutorialSubtitle3')}</p>
              
              <div 
                className={`${styles.demoArea} ${styles.interactive}`}
                onClick={handleDemoTap}
              >
                <svg width="300" height="300" viewBox="0 0 300 300">
                  <circle 
                    cx={CENTER} 
                    cy={CENTER} 
                    r={RING_RADIUS + RING_STROKE / 2 + 3} 
                    fill="none" 
                    stroke="#0f3460" 
                    strokeWidth="2" 
                  />
                  
                  <circle 
                    cx={CENTER} 
                    cy={CENTER} 
                    r={RING_RADIUS} 
                    fill="none" 
                    stroke="#4a5568" 
                    strokeWidth={RING_STROKE} 
                  />
                  
                  <path 
                    ref={arcRef}
                    d={`M ${arcStartX} ${arcStartY} A ${ORBIT_RADIUS} ${ORBIT_RADIUS} 0 0 1 ${arcEndX} ${arcEndY}`}
                    stroke="#22c55e" 
                    strokeWidth={RING_STROKE} 
                    strokeLinecap="butt" 
                    fill="none"
                    className={`${styles.targetArc} ${showTapHint ? styles.pulse : ''}`}
                  />
                  
                  <circle 
                    ref={dotRef}
                    cx={dotX} 
                    cy={dotY} 
                    r={showHitEffect ? 14 : 12} 
                    fill="#fbbf24"
                    stroke="#000"
                    strokeWidth="2"
                    style={{ filter: showHitEffect ? 'drop-shadow(0 0 12px #fbbf24)' : 'drop-shadow(0 0 6px #fbbf24)' }}
                    className={`${styles.dot} ${showHitEffect ? styles.hit : ''}`}
                  />
                  
                  {showHitEffect && (
                    <>
                      <circle cx={dotX} cy={dotY} r="20" fill="none" stroke="#22c55e" strokeWidth="3" className={styles.hitRing} />
                      <circle cx={dotX} cy={dotY} r="30" fill="none" stroke="#22c55e" strokeWidth="2" className={styles.hitRing2} />
                    </>
                  )}
                </svg>
                
                <div className={styles.tapCounter}>
                  {t('tutorialHits')}: {tapCount}/3
                </div>
                
                {showTapHint && (
                  <div className={styles.tapNow}>{t('tutorialTapNow')}</div>
                )}
              </div>
              
              <p className={styles.description}>{t('tutorialContent3')}</p>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={styles.title}>{t('tutorialTitle6')}</h1>
              <p className={styles.subtitle}>{t('tutorialSubtitle6')}</p>
              
              <div className={styles.iconDisplay}>
                {connected || session ? (
                  <div className={styles.connectedBox}>
                    <PixelCheckmark size={48} />
                    <span className={styles.connectedText}>{t('connected')}</span>
                    {session?.username && (
                      <span className={styles.usernameText}>@{session.username}</span>
                    )}
                  </div>
                ) : (
                  <div className={styles.walletEmoji}>🔗</div>
                )}
              </div>
              
              <p className={styles.description}>{t('tutorialContent6')}</p>
              
              {connectionError && (
                <p className={styles.errorText}>{connectionError}</p>
              )}
            </>
          )}
        </div>
        
        <div className={styles.footer}>
          {step === 0 && (
            <button className={styles.nextBtn} onClick={handleNext}>
              {t('tutorialNext')}
            </button>
          )}

          {step === 1 && (
            <button className={styles.nextBtn} onClick={handleNext}>
              {t('tutorialNext')}
            </button>
          )}

          {step === 2 && (
            <p className={styles.hint}>{t('tutorialContent3')}</p>
          )}

          {step === 3 && (
            <div className={styles.connectButtons}>
              {connected || session ? (
                <button className={styles.nextBtn} onClick={onComplete}>
                  {t('tutorialStart')}
                </button>
              ) : (
                <button 
                  className={styles.nextBtn} 
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting ? t('tutorialConnecting') : t('tutorialConnectWallet')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

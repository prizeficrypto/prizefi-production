'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { sounds } from '@/lib/sounds';
import { useLanguage } from '../contexts/LanguageContext';

// =============================
// Precision Tap — One-Shot Mode
// =============================
// - One-shot: a single miss (or idling for MAX_LOOPS full rotations) ends the run.
// - Speed increases every correct tap and NEVER resets until game over.
// - Wrap-safe hit detection (atan2(sinΔ, cosΔ)).
// - Target arc drawn exactly on the circle.
// - Haptics: short buzz on hit, patterned buzz on miss.
// - Hit dots show for 0.5s (no accumulation).
// - COMPETITION FEATURES: Seeded RNG, tap logging, input logging, onGameOver callback

// ===== Constants =====
const MAX_SPEED = 6;                   // radians/sec cap
const SPEED_INCREMENT = 0.3125;        // +speed per hit
const CIRCLE_RADIUS = 120;             // px radius
const TARGET_BASE_ARC = Math.PI / 6;   // 30°
const TARGET_ARC = TARGET_BASE_ARC * 1.5; // 1.5x window
const TWO_PI = Math.PI * 2;
// MAX_LOOPS removed - game only ends on miss or 15s inactivity

// ===== Types =====
interface Particle { id:number; x:number; y:number; vx:number; vy:number; life:number; }
interface HitDot { id:number; x:number; y:number; }
interface InputEvent {
  t: number;
  action: string;
  hit?: boolean;
}

interface TimingCircleGameProps {
  seed?: string;
  onGameOver?: (score: number, seed: string, taps: number[], inputLog: InputEvent[]) => void;
}

// ===== Helpers (top-level) =====
export function angDiff(a: number, b: number): number {
  const s = Math.sin(a - b);
  const c = Math.cos(a - b);
  return Math.atan2(s, c); // in [-PI, PI]
}
export function isAngleHit(angleNow: number, target: number, windowRad: number): boolean {
  return Math.abs(angDiff(angleNow, target)) <= windowRad / 2;
}

let PID = 0;

export default function TimingCircleGame({ seed, onGameOver }: TimingCircleGameProps = {}) {
  const { t } = useLanguage();
  
  // Core state
  const [score, setScore] = useState<number>(0);
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem("precision-tap-best")) || 0);
  const [angle, setAngle] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1.0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [targetAngle, setTargetAngle] = useState<number>(0);
  const [secondsSinceLastTap, setSecondsSinceLastTap] = useState<number>(0);
  const [loops, setLoops] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("");
  const [isOver, setIsOver] = useState<boolean>(false);
  const [runToken, setRunToken] = useState<number>(0); // Increments on EVERY run start

  // Juice
  const [justHit, setJustHit] = useState<boolean>(false);
  const [shakeOffset, setShakeOffset] = useState<{x:number;y:number}>({ x: 0, y: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [hintPulse, setHintPulse] = useState<boolean>(true);
  const [hitDots, setHitDots] = useState<HitDot[]>([]);

  // Refs
  const raf = useRef<number | null>(null);
  const lastTs = useRef<number | null>(null);
  const angleRef = useRef<number>(0);
  const overRef = useRef<boolean>(false);
  const speedRef = useRef<number>(1.0);
  const directionRef = useRef<1 | -1>(1);
  const lastTapTime = useRef<number>(Date.now());
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);

  // Competition telemetry
  const startTime = useRef(Date.now());
  const tapLog = useRef<number[]>([]);
  const inputLog = useRef<InputEvent[]>([]);
  // CRITICAL: Separate RNG for game logic (deterministic, synced with server)
  const seededRandomRef = useRef<(() => number) | undefined>(undefined);
  // Separate RNG for visual effects only (NOT synced with server - uses Math.random)
  // This prevents particle/shake/text effects from desynchronizing the game logic RNG
  
  // Score and loops refs - updated IMMEDIATELY to prevent race conditions with gameOver
  const scoreRef = useRef<number>(0);
  const loopsRef = useRef<number>(0);

  // Seeded RNG (LCG algorithm)
  const createSeededRandom = useCallback((seedStr: string): () => number => {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash = hash & hash;
    }
    return function() {
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      return hash / 0x7fffffff;
    };
  }, []);

  // Track game state at last input for deterministic angle calculation
  // CRITICAL: These are separate from the animation loop refs to avoid double-counting
  const lastInputTimeRef = useRef<number>(0);
  const angleAtLastInputRef = useRef<number>(0);  // Angle when last input was processed
  const speedAtLastInputRef = useRef<number>(1.0);  // Speed when last input was processed
  const directionAtLastInputRef = useRef<1 | -1>(1);  // Direction when last input was processed
  
  // Centralized beginRun function - ONLY way to start a game
  const beginRun = useCallback(() => {
    console.log('🎬 beginRun() called');
    
    // Reset ALL game state - refs MUST be reset immediately to prevent race conditions
    startTime.current = Date.now();
    lastTapTime.current = Date.now();
    tapLog.current = [];
    inputLog.current = [];
    lastInputTimeRef.current = 0; // Reset input timing for deterministic replay
    angleAtLastInputRef.current = 0; // Start at angle 0
    speedAtLastInputRef.current = 1.0; // Start at speed 1.0
    directionAtLastInputRef.current = 1; // Start moving clockwise
    scoreRef.current = 0; // CRITICAL: Reset score ref immediately
    loopsRef.current = 0; // CRITICAL: Reset loops ref immediately
    setScore(0);
    setSecondsSinceLastTap(0);
    setLoops(0);
    setSpeed(1.0);
    speedRef.current = 1.0;
    setDirection(1);
    directionRef.current = 1;
    setIsOver(false);
    overRef.current = false;
    setAngle(0);
    angleRef.current = 0;
    lastTs.current = null;
    
    // Increment runToken to trigger timer restart
    setRunToken(token => {
      const newToken = token + 1;
      console.log('🎬 Run token incremented:', newToken);
      return newToken;
    });
  }, []);
  
  // Initialize on seed change
  useEffect(() => {
    if (seed) {
      const seededRandom = createSeededRandom(seed);
      seededRandomRef.current = seededRandom;
      setTargetAngle(seededRandom() * TWO_PI);
    } else {
      seededRandomRef.current = undefined;
      setTargetAngle(Math.random() * TWO_PI);
    }

    // Start a new run (ALWAYS called on seed change)
    beginRun();
  }, [seed, createSeededRandom, beginRun]);
  
  // Also start a run on component mount (for demo/replay paths that don't change seed)
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      // First mount is handled by seed effect above
      return;
    }
    // On subsequent mounts/re-renders where seed didn't change, still start a new run
    console.log('🔄 Component re-mounted or re-initialized');
    beginRun();
  }, []); // Empty deps = runs on mount
  
  // Inactivity watchdog - uses ref to call latest gameOver
  const INACTIVITY_TIMEOUT = 15; // seconds without tapping
  const gameOverRef = useRef<((msg: string) => void) | null>(null);
  
  useEffect(() => {
    if (runToken === 0) {
      console.log('⏱️ Skipping timer (runToken=0)');
      return; // Skip before first run
    }
    
    // Clear any existing timer
    if (inactivityTimer.current) {
      console.log('⏱️ Clearing existing timer');
      clearInterval(inactivityTimer.current);
      inactivityTimer.current = null;
    }
    
    // Start new timer
    const displayTimer = setInterval(() => {
      if (!overRef.current) {
        const timeSinceLastTap = (Date.now() - lastTapTime.current) / 1000;
        setSecondsSinceLastTap(timeSinceLastTap);
        
        // Check timeout
        if (timeSinceLastTap >= INACTIVITY_TIMEOUT) {
          const elapsed = Date.now() - startTime.current;
          inputLog.current.push({
            t: elapsed,
            action: 'timeout',
            hit: false
          });
          console.log('⏱️ Game ended due to inactivity:', timeSinceLastTap.toFixed(1), 's');
          // Use ref to call latest gameOver function
          if (gameOverRef.current) {
            gameOverRef.current("Time up — round submitted ✨");
          }
          clearInterval(displayTimer);
          inactivityTimer.current = null;
        }
      }
    }, 100);
    
    inactivityTimer.current = displayTimer;
    console.log('⏱️ Inactivity timer started, runToken:', runToken);
    
    return () => {
      if (inactivityTimer.current) {
        console.log('⏱️ Inactivity timer cleanup, runToken:', runToken);
        clearInterval(inactivityTimer.current);
        inactivityTimer.current = null;
      }
    };
  }, [runToken]); // Re-arm timer on EVERY run start

  // Enhanced Haptic Feedback Patterns
  const sendHaptic = useCallback((type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'selection') => {
    try {
      if (MiniKit.isInstalled() && MiniKit.commandsAsync?.sendHapticFeedback) {
        if (type === 'success' || type === 'error' || type === 'warning') {
          MiniKit.commandsAsync.sendHapticFeedback({ hapticsType: 'notification', style: type }).catch(() => {});
        } else if (type === 'selection') {
          MiniKit.commandsAsync.sendHapticFeedback({ hapticsType: 'selection-changed' }).catch(() => {});
        } else {
          MiniKit.commandsAsync.sendHapticFeedback({ hapticsType: 'impact', style: type }).catch(() => {});
        }
      } else {
        const patterns: Record<string, number | number[]> = {
          light: 15,
          medium: [20, 30, 40],
          heavy: [30, 50, 30, 50, 60],
          success: [30, 50, 30, 50, 60],
          error: [100, 50, 100, 50, 200],
          warning: [15, 30, 15, 30, 15],
          selection: 10
        };
        navigator?.vibrate?.(patterns[type] || 15);
      }
    } catch {}
  }, []);

  const haptics = useMemo(() => ({
    tap: () => sendHaptic('light'),
    hit: () => sendHaptic('medium'),
    perfectHit: () => sendHaptic('success'),
    miss: () => sendHaptic('warning'),
    gameOver: () => sendHaptic('error'),
    speedUp: () => sendHaptic('light'),
    countdown: () => sendHaptic('selection')
  }), [sendHaptic]);
  
  const vibrate = (pattern: number | number[]) => {
    try { navigator?.vibrate?.(pattern); } catch {}
  };

  const resetRound = useCallback(() => {
    if (seededRandomRef.current) {
      setTargetAngle(seededRandomRef.current() * TWO_PI);
    } else {
      setTargetAngle(Math.random() * TWO_PI);
    }
  }, []);

  // Animation loop
  useEffect(() => {
    const tick = (ts: number) => {
      if (overRef.current) return;
      if (lastTs.current == null) lastTs.current = ts;
      const dt = Math.min(0.05, (ts - lastTs.current) / 1000);
      lastTs.current = ts;

      const prev = angleRef.current;
      angleRef.current = (angleRef.current + directionRef.current * speedRef.current * dt + TWO_PI) % TWO_PI;
      setAngle(angleRef.current);

      // Count completed loops (full rotations without tapping)
      if ((directionRef.current === 1 && prev > angleRef.current) || 
          (directionRef.current === -1 && prev < angleRef.current)) {
        setLoops((l) => l + 1);
      }

      // particle integration
      setParticles((ps) => ps
        .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt }))
        .filter((p) => p.life > 0)
      );

      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  // Sync refs with state
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { directionRef.current = direction; }, [direction]);

  // NOTE: isHit is no longer used - we calculate exact angle at tap time instead
  // Keeping for backwards compatibility but marking as deprecated
  const isHit = useCallback(
    () => isAngleHit(angleRef.current, targetAngle, TARGET_ARC),
    [targetAngle]
  );

  // Helper: Get random value for VISUAL EFFECTS ONLY (particles, shake, text)
  // CRITICAL: Always uses Math.random() to avoid desyncing the seeded game RNG
  const getEffectRandom = useCallback(() => {
    return Math.random();
  }, []);

  // Particles - uses effect RNG (not game RNG)
  const spawnParticles = useCallback((cx: number, cy: number) => {
    const out: Particle[] = [];
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TWO_PI;
      const sp = 140 + getEffectRandom() * 80;
      out.push({ id: PID++, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + getEffectRandom() * 0.25 });
    }
    setParticles((ps) => ps.concat(out));
  }, [getEffectRandom]);

  // Shake - uses effect RNG (not game RNG)
  const doShake = useCallback(() => {
    const start = Date.now();
    const dur = 180;
    const tick = () => {
      const t = Date.now() - start;
      if (t >= dur) { setShakeOffset({ x: 0, y: 0 }); return; }
      setShakeOffset({ x: (getEffectRandom() - 0.5) * 10, y: (getEffectRandom() - 0.5) * 10 });
      requestAnimationFrame(tick);
    };
    tick();
  }, [getEffectRandom]);

  // Game over handler
  const gameOver = useCallback((msg: string) => {
    // Prevent double game over
    if (overRef.current) {
      return;
    }
    
    setFeedback(msg);
    setIsOver(true);
    overRef.current = true;
    setBest((b) => {
      const newBest = Math.max(b, scoreRef.current);
      localStorage.setItem("precision-tap-best", String(newBest));
      return newBest;
    });

    // Competition callback
    if (onGameOver && seed) {
      onGameOver(scoreRef.current, seed, tapLog.current, inputLog.current);
    }
  }, [onGameOver, seed, loops, isOver]);

  // Keep gameOverRef in sync for the inactivity timer
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  // Loop counter tracking (for visual feedback only, no longer auto-submits)
  useEffect(() => {
    loopsRef.current = loops;
  }, [loops]);

  // Random success text - uses effect RNG (not game RNG)
  const getSuccessText = useCallback(() => {
    const msgs = ["Great timing!", "Clean hit!", "Nice flow!", "Locked in!", "On rhythm!"];
    return msgs[Math.floor(getEffectRandom() * msgs.length)];
  }, [getEffectRandom]);

  // Calculate the exact angle at a given elapsed time (matches server replay exactly)
  // CRITICAL: Uses angleAtLastInputRef (not angleRef) to avoid double-counting from animation loop
  const calculateAngleAtTime = useCallback((elapsedMs: number): number => {
    const elapsedSinceLastInput = (elapsedMs - lastInputTimeRef.current) / 1000;
    // Use the state frozen at last input, NOT the constantly-updating animation refs
    return (angleAtLastInputRef.current + directionAtLastInputRef.current * speedAtLastInputRef.current * elapsedSinceLastInput + TWO_PI) % TWO_PI;
  }, []);
  
  // Tap - CRITICAL: Calculate exact angle at tap time for deterministic server validation
  const handleTap = useCallback(() => {
    if (overRef.current) {
      return;
    }

    const elapsed = Date.now() - startTime.current;
    tapLog.current.push(elapsed);
    
    // Reset inactivity timer and loop counter on every tap
    // Update refs IMMEDIATELY to prevent race conditions
    lastTapTime.current = Date.now();
    setSecondsSinceLastTap(0);
    loopsRef.current = 0;
    setLoops(0); // Reset loop counter when user taps

    // Calculate the EXACT angle at this tap time (not the last animation frame angle)
    // This matches the server's replay calculation exactly
    const exactAngle = calculateAngleAtTime(elapsed);
    const hit = isAngleHit(exactAngle, targetAngle, TARGET_ARC);
    
    // Update the angle ref to match what we calculated (keeps client in sync)
    angleRef.current = exactAngle;

    if (hit) {
      const angleDiff = Math.abs(angDiff(exactAngle, targetAngle));
      const isPerfect = angleDiff < TARGET_ARC / 6;
      if (isPerfect) {
        haptics.perfectHit();
        sounds.perfectHit();
      } else {
        haptics.hit();
        sounds.hit();
      }
      setJustHit(true); setTimeout(() => setJustHit(false), 160);
      setFeedback(isPerfect ? "PERFECT!" : getSuccessText());

      const cx = arenaCenter.cx + CIRCLE_RADIUS * Math.cos(angleRef.current);
      const cy = arenaCenter.cy + CIRCLE_RADIUS * Math.sin(angleRef.current);
      spawnParticles(cx, cy);

      // temp hit dot (0.5s) - use PID for deterministic ID
      const newDot: HitDot = { id: PID++, x: cx, y: cy };
      setHitDots((dots) => [...dots, newDot]);
      setTimeout(() => setHitDots((dots) => dots.filter((d) => d.id !== newDot.id)), 500);

      inputLog.current.push({
        t: elapsed,
        action: 'flap',
        hit: true
      });

      // Update scoreRef IMMEDIATELY (not via useEffect) to prevent race conditions
      scoreRef.current = scoreRef.current + 1;
      
      // Calculate NEW speed and direction (must match server exactly)
      const newSpeed = Math.min(MAX_SPEED, speedAtLastInputRef.current + SPEED_INCREMENT);
      const newDirection = (-directionAtLastInputRef.current as 1 | -1);
      
      // CRITICAL: Save state for next tap calculation BEFORE state updates
      // This matches server replay exactly: after a hit, we advance with new speed/direction
      angleAtLastInputRef.current = exactAngle;
      lastInputTimeRef.current = elapsed;
      speedAtLastInputRef.current = newSpeed;
      directionAtLastInputRef.current = newDirection;
      
      setScore((s) => {
        const newScore = s + 1;
        setBest((b) => { const nb = Math.max(newScore, b); localStorage.setItem("precision-tap-best", String(nb)); return nb; });
        setSpeed(newSpeed);
        setDirection(newDirection);
        setHintPulse(false);
        resetRound();
        if (newScore % 3 === 0) {
          setTimeout(() => {
            haptics.speedUp();
            sounds.speedUp();
          }, 100);
        }
        return newScore;
      });
    } else {
      haptics.miss();
      sounds.miss();
      doShake();
      
      angleAtLastInputRef.current = exactAngle;
      lastInputTimeRef.current = elapsed;
      
      inputLog.current.push({
        t: elapsed,
        action: 'flap',
        hit: false
      });
      
      haptics.gameOver();
      sounds.gameOver();
      gameOver("Miss — game over");
    }
  }, [calculateAngleAtTime, targetAngle, resetRound, seed, onGameOver, spawnParticles, doShake, getSuccessText, gameOver]);

  // visuals - center for the 280x280 SVG
  const arenaCenter = { cx: 140, cy: 140 };
  const marker = useMemo(() => ({
    x: arenaCenter.cx + CIRCLE_RADIUS * Math.cos(angle),
    y: arenaCenter.cy + CIRCLE_RADIUS * Math.sin(angle),
  }), [angle]);

  // target arc path locked to circle
  const targetPath = useMemo(() => {
    const start = targetAngle - TARGET_ARC / 2;
    const end = targetAngle + TARGET_ARC / 2;
    const startX = arenaCenter.cx + CIRCLE_RADIUS * Math.cos(start);
    const startY = arenaCenter.cy + CIRCLE_RADIUS * Math.sin(start);
    const endX = arenaCenter.cx + CIRCLE_RADIUS * Math.cos(end);
    const endY = arenaCenter.cy + CIRCLE_RADIUS * Math.sin(end);
    const delta = (end - start + TWO_PI) % TWO_PI;
    const largeArcFlag = delta > Math.PI ? 1 : 0;
    const sweepFlag = 1;
    return `M ${startX} ${startY} A ${CIRCLE_RADIUS} ${CIRCLE_RADIUS} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
  }, [targetAngle]);

  return (
    <main
      className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-6"
      style={{
        background: '#ffffff',
        fontFamily: 'var(--font-retro), monospace'
      }}
    >
      <div className="w-full max-w-sm" style={{ transform: `translate(${shakeOffset.x}px, ${shakeOffset.y}px)` }}>
        {/* Header */}
        <div className="mb-4 text-center">
          <h1 style={{
            fontFamily: 'var(--font-retro), monospace',
            fontSize: '14px',
            color: '#2563eb',
            textTransform: 'uppercase',
            textShadow: '1px 1px 0 rgba(0,0,0,0.1)'
          }}>Precision Tap</h1>
        </div>

        {/* HUD */}
        <div className="flex justify-center gap-2 mb-4">
          <HudCard label="Score" value={score} pop={justHit} />
          <HudCard label="Best" value={best} />
          <HudCard label="Speed" value={`${speed.toFixed(1)}x`} />
        </div>

        {/* Arena - Use ONLY onPointerDown to prevent duplicate tap handling */}
        <div 
          style={{
            background: '#f8fafc',
            border: '3px solid #e2e8f0',
            borderRadius: '16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '16px',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            userSelect: 'none'
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            handleTap();
          }}
        >
          <div className="relative flex items-center justify-center">
            <svg width="280" height="280" className="overflow-visible" style={{ maxWidth: '100%' }}>
              {/* Outer glow ring */}
              <circle cx={arenaCenter.cx} cy={arenaCenter.cy} r={CIRCLE_RADIUS + 8} fill="none" stroke="#e2e8f0" strokeWidth="4" />
              
              {/* Main track - clean look */}
              <circle cx={arenaCenter.cx} cy={arenaCenter.cy} r={CIRCLE_RADIUS} fill="none" stroke="#cbd5e1" strokeWidth="14" />
              
              {/* Target arc - bright green retro */}
              <path 
                d={targetPath} 
                stroke="#22c55e" 
                strokeWidth="14" 
                strokeLinecap="butt" 
                fill="none"
                style={{ filter: 'drop-shadow(0 0 8px #22c55e)' }}
              />
              
              {/* Player marker - bright with glow */}
              <circle 
                cx={marker.x} 
                cy={marker.y} 
                r={justHit ? 14 : 12} 
                fill="#fbbf24"
                stroke="#000"
                strokeWidth="2"
                style={{ filter: justHit ? 'drop-shadow(0 0 12px #fbbf24)' : 'drop-shadow(0 0 6px #fbbf24)' }}
              />
              
              {/* Particles - retro squares */}
              {particles.map((p) => (
                <rect 
                  key={p.id} 
                  x={p.x - 4} 
                  y={p.y - 4} 
                  width={8} 
                  height={8} 
                  fill="#22c55e" 
                  opacity={Math.max(0, p.life * 2)} 
                />
              ))}
              
              {/* Hit dots - retro squares */}
              {hitDots.map((d) => (
                <rect 
                  key={d.id} 
                  x={d.x - 5} 
                  y={d.y - 5} 
                  width={10} 
                  height={10} 
                  fill="#22c55e" 
                  opacity={0.85} 
                />
              ))}
            </svg>

            {hintPulse && !isOver && (
              <div style={{
                position: 'absolute',
                bottom: '-8px',
                fontFamily: 'var(--font-retro), monospace',
                fontSize: '6px',
                color: '#64748b',
                textTransform: 'uppercase',
                animation: 'pulse 2s infinite'
              }}>{t('tapGreenZone')}</div>
            )}

            {isOver && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.85)'
              }}>
                <div className="text-center">
                  <div style={{
                    fontFamily: 'var(--font-retro), monospace',
                    fontSize: '12px',
                    color: '#ef4444',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                    textShadow: '2px 2px 0 #000'
                  }}>{t('gameOver')}</div>
                  <div style={{
                    fontFamily: 'var(--font-retro), monospace',
                    fontSize: '8px',
                    color: '#fbbf24'
                  }}>{t('score')}: {score}</div>
                </div>
              </div>
            )}
          </div>

          {/* Inactivity timer progress */}
          <div className="mt-4">
            <div className="flex justify-between mb-1" style={{
              fontFamily: 'var(--font-retro), monospace',
              fontSize: '6px',
              color: '#64748b',
              textTransform: 'uppercase'
            }}>
              <span>{t('timeLeft')}</span>
              <span>{Math.max(0, INACTIVITY_TIMEOUT - Math.floor(secondsSinceLastTap))}s</span>
            </div>
            <div style={{
              height: '8px',
              background: '#e2e8f0',
              borderRadius: '4px'
            }}>
              <div 
                style={{ 
                  height: '100%',
                  width: `${Math.max(0, 100 - (secondsSinceLastTap / INACTIVITY_TIMEOUT) * 100)}%`,
                  backgroundColor: secondsSinceLastTap > INACTIVITY_TIMEOUT * 0.7 ? '#ef4444' : '#22c55e',
                  borderRadius: '4px',
                  transition: 'width 0.3s, background-color 0.3s'
                }} 
              />
            </div>
          </div>

          {/* Feedback message box */}
          <div
            style={{
              marginTop: '12px',
              padding: '8px 12px',
              borderRadius: '8px',
              textAlign: 'center',
              fontFamily: 'var(--font-retro), monospace',
              fontSize: '7px',
              textTransform: 'uppercase',
              background: feedback.toLowerCase().includes("miss")
                ? '#fef2f2'
                : feedback.toLowerCase().includes("time up") || feedback.toLowerCase().includes("submitted") || isOver
                ? '#eff6ff'
                : '#f0fdf4',
              color: feedback.toLowerCase().includes("miss")
                ? '#dc2626'
                : feedback.toLowerCase().includes("time up") || feedback.toLowerCase().includes("submitted") || isOver
                ? '#2563eb'
                : '#16a34a',
              border: feedback.toLowerCase().includes("miss")
                ? '1px solid #fecaca'
                : feedback.toLowerCase().includes("time up") || feedback.toLowerCase().includes("submitted") || isOver
                ? '1px solid #bfdbfe'
                : '1px solid #bbf7d0'
            }}
          >
            {feedback}
          </div>
        </div>
      </div>
    </main>
  );
}

// ===== Self-check logs (dev only) =====
(function runSelfChecks(){
  try {
    const nearZero = isAngleHit(0, 0, TARGET_ARC);
    const seamWrap = isAngleHit(0.01, TWO_PI - 0.01, TARGET_ARC);
    const farAway = isAngleHit(Math.PI, 0, TARGET_ARC);
    const edgeLeft = isAngleHit(TARGET_ARC / 2, 0, TARGET_ARC);
    const edgeRight = isAngleHit(-TARGET_ARC / 2, 0, TARGET_ARC);
    // eslint-disable-next-line no-console
    console.log("[SelfCheck] nearZero:", nearZero, "seamWrap:", seamWrap, "farAway:", farAway, "edgeLeft:", edgeLeft, "edgeRight:", edgeRight);
  } catch {}
})();

function HudCard({ label, value, pop }: { label: string; value: number | string; pop?: boolean }) {
  return (
    <div style={{
      background: '#ffffff',
      border: '2px solid #e2e8f0',
      borderRadius: '12px',
      boxShadow: pop ? '0 4px 12px rgba(37, 99, 235, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.06)',
      padding: '8px 12px',
      textAlign: 'center',
      minWidth: '70px',
      transition: 'box-shadow 0.15s, transform 0.15s',
      transform: pop ? 'scale(1.05)' : 'scale(1)'
    }}>
      <div style={{
        fontFamily: 'var(--font-retro), monospace',
        fontSize: '6px',
        textTransform: 'uppercase',
        color: '#64748b',
        marginBottom: '4px'
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-retro), monospace',
        fontSize: '14px',
        color: '#2563eb',
        textShadow: pop ? '0 0 8px rgba(37, 99, 235, 0.4)' : 'none',
        transition: 'text-shadow 0.15s'
      }}>{value}</div>
    </div>
  );
}


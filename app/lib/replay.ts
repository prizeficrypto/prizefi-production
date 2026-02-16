interface TapEvent {
  timestamp: number
}

export function validateGameReplay(seed: string, taps: number[], expectedScore: number): boolean {
  const PIPE_SPAWN_INTERVAL = 1500
  const BIRD_JUMP_VELOCITY = -350
  const GRAVITY = 1000
  const PIPE_VELOCITY = -200
  const PIPE_GAP = 150
  const PIPE_START_X = 450
  const BIRD_START_X = 100
  
  if (!taps || taps.length === 0) {
    return expectedScore === 0
  }
  
  let score = 0
  let birdY = 300
  let birdVelocity = 0
  const pipes: Array<{ x: number, gapY: number, scored: boolean }> = []
  let lastPipeSpawn = 0
  let powerUpMultiplier = 1
  
  const gameEndTime = Math.max(...taps, PIPE_SPAWN_INTERVAL * 10)
  const FRAME_DURATION = 16.67
  
  let tapIndex = 0
  
  for (let time = 0; time <= gameEndTime; time += FRAME_DURATION) {
    while (tapIndex < taps.length && taps[tapIndex] <= time) {
      birdVelocity = BIRD_JUMP_VELOCITY
      tapIndex++
    }
    
    birdVelocity += (GRAVITY * FRAME_DURATION) / 1000
    birdY += (birdVelocity * FRAME_DURATION) / 1000
    
    if (birdY > 600 || birdY < 0) {
      break
    }
    
    if (time - lastPipeSpawn >= PIPE_SPAWN_INTERVAL) {
      const random = seededRandom(seed, pipes.length)
      const minY = 100
      const maxY = 400
      const gapY = minY + random * (maxY - minY)
      
      pipes.push({ x: PIPE_START_X, gapY, scored: false })
      lastPipeSpawn = time
    }
    
    for (const pipe of pipes) {
      pipe.x += (PIPE_VELOCITY * FRAME_DURATION) / 1000
      
      if (pipe.x < BIRD_START_X && !pipe.scored) {
        pipe.scored = true
        score += powerUpMultiplier
      }
      
      if (
        pipe.x < BIRD_START_X + 34 &&
        pipe.x + 52 > BIRD_START_X &&
        (birdY < pipe.gapY - PIPE_GAP / 2 || birdY > pipe.gapY + PIPE_GAP / 2)
      ) {
        break
      }
    }
  }
  
  const tolerance = 2
  return Math.abs(score - expectedScore) <= tolerance
}

function seededRandom(seed: string, index: number): number {
  const str = seed + index.toString()
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash % 1000) / 1000
}

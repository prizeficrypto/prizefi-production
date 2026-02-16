export function isMobileAndMiniApp(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent.toLowerCase()
  const isMobileUA = /android|iphone|ipad|ipod/.test(userAgent)
  const isSmallScreen = window.innerWidth < 900

  return isMobileUA && isSmallScreen
}

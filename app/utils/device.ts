"use client";
export function isMobileAndMiniApp() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isPhone = /iPhone|Android/i.test(ua);
  const narrow = window.innerWidth < 900;
  return isPhone && narrow;
}
export function shortAddr(a: string) {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
}

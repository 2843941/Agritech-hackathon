// useLocalStorage — a React state hook that persists to localStorage.
//
// Why this exists: for the hackathon, plants and watering history live in
// the browser, not in Supabase. That keeps Track A focused on the
// crop/weather data and means the app works even without a database
// connection. When we add real auth + Supabase persistence later, only
// this file needs to change.
//
// Usage:
//   const [value, setValue] = useLocalStorage('key', defaultValue)
//
// Works just like useState but survives page refresh.

import { useEffect, useState } from 'react'

export function useLocalStorage(key, initialValue) {
  // Lazy initializer: read from localStorage once, on first mount.
  // If nothing is stored yet (or the stored value is corrupt), fall back
  // to the default. We wrap JSON.parse in try/catch so a bad value can't
  // crash the app.
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : initialValue
    } catch {
      return initialValue
    }
  })

  // Write back to localStorage whenever the value changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Quota exceeded or private mode — silently ignore. The app still
      // works for the current session, it just doesn't persist.
    }
  }, [key, value])

  return [value, setValue]
}

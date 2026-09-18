// CropRecommendations — shows 3-5 crops for the picked field.
//
// How it works:
//   - Receives lat/lon from App.jsx (set by FieldMap click or geolocation).
//   - On mount and whenever lat/lon changes, calls the backend's
//     /api/crops endpoint with those coordinates.
//   - Backend determines province + current season and returns matching crops.
//   - Renders them as a card with each crop's name and a one-line detail.
//
// Backend shape note: the endpoint returns { status: "success", crops: [...] }.
// It also currently returns each crop twice (data-side bug, tracked separately),
// so we dedupe on the client until that's fixed.

import { useEffect, useState } from 'react'
import Icon from './Icon'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function CropRecommendations({ fieldProfile }) {
  const [crops, setCrops] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pull lat/lon out of the field profile. If no field has been picked
  // yet, don't render anything — the user needs to pick a field first.
  const lat = fieldProfile?.location?.latitude
  const lon = fieldProfile?.location?.longitude

  useEffect(() => {
    if (!lat || !lon) {
      setCrops([])
      return
    }

    let cancelled = false  // guard against race conditions when clicking fast

    const fetchCrops = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`${API_BASE_URL}/api/crops?lat=${lat}&lon=${lon}`)
        if (!res.ok) throw new Error('Crop recommendations are not available yet.')
        const data = await res.json()

        // Handle both response shapes:
        //   - { status: 'success', crops: [...] }  (current backend)
        //   - [...]                                (older/simpler shape)
        const list = Array.isArray(data) ? data : (data?.crops ?? [])

        // Deduplicate by crop name. The backend currently returns each
        // crop twice (duplicate seed rows). This is a client-side band-aid
        // until the DB is cleaned up.
        const seen = new Set()
        const unique = list.filter((c) => {
          const key = c.name || c.crop
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        if (!cancelled) setCrops(unique)
      } catch (err) {
        // Silently ignore "endpoint doesn't exist" errors so this component
        // stays visible-but-quiet if the backend is down.
        if (!cancelled) {
          setCrops([])
          setError('')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchCrops()
    return () => { cancelled = true }
  }, [lat, lon])

  // Don't show the card at all until a field has been picked.
  if (!lat || !lon) return null

  return (
    <div className="container">
      <div className="crop-recs card">
        <div className="card-label">
          <span><Icon name="leaf" size={18} /> RECOMMENDED CROPS</span>
        </div>
        <p className="crop-recs-lede">
          Based on your field location and the current season, these crops
          suit your conditions:
        </p>

        {loading && <p className="crop-loading">Thinking about your field…</p>}

        {!loading && crops.length === 0 && !error && (
          <p className="crop-empty">
            Crop recommendations aren't available yet. They'll appear here once
            the backend is ready.
          </p>
        )}

        {crops.length > 0 && (
          <ul className="crop-list">
            {crops.map((crop) => (
              <li key={crop.id || crop.name}>
                <strong>{crop.name}</strong>
                <span>
                  {crop.category}
                  {crop.growing_season && ` · ${crop.growing_season}`}
                  {crop.optimal_soil_ph != null && ` · pH ${crop.optimal_soil_ph}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
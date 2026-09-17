// CropRecommendations — shows 3-5 crops for the picked field.
//
// How it works:
//   - Receives lat/lon from App.jsx (set by FieldMap click or geolocation).
//   - On mount and whenever lat/lon changes, calls the backend's
//     /api/crops endpoint with those coordinates.
//   - Backend determines province + current season and returns matching crops.
//   - Renders them as a card with each crop's name and a one-line note.
//
// If the backend endpoint doesn't exist yet (Track A's job), the fetch
// fails silently and we render nothing. That way this component can be
// built and demoed before Andile's backend work lands.

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
        if (!cancelled) setCrops(Array.isArray(data) ? data : [])
      } catch (err) {
        // Silently ignore "endpoint doesn't exist" errors so this component
        // stays visible-but-quiet until Andile's backend work lands.
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
              <li key={crop.name || crop.crop}>
                <strong>{crop.name || crop.crop}</strong>
                {crop.notes && <span>{crop.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

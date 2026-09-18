// FieldMap — interactive map for picking a field location, with autocomplete search.
//
// Why Leaflet: free, no API key, works offline-ish (tiles come from OSM).
// Google Maps needs a billing account; Leaflet doesn't.
//
// Design:
//   - The map starts centered on South Africa.
//   - Clicking anywhere drops a marker and fires onPick(lat, lon).
//   - The search box hits Nominatim (OpenStreetMap's free geocoder) as the
//     user types, with a 400ms debounce to respect the 1 req/sec rate limit,
//     and shows a dropdown of matches. Clicking a match jumps the map there.
//   - The parent (App.jsx) passes onPick to loadFieldProfile(), so the
//     dashboard updates automatically with the picked location's weather.

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Icon from './Icon'

// Leaflet's default marker icon URLs are broken when bundled by Vite
// (they resolve relative to the CSS file, not the JS bundle). Fixing it
// by pointing to the CDN copies of the standard markers.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Attaches the click handler to the Leaflet map instance.
function ClickPicker({ onPick }) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng
      onPick(lat, lng)
    },
  })
  return null
}

// Imperative handle on the Leaflet map so the parent can recenter it
// from outside (e.g. after a search result).
function MapController({ controllerRef }) {
  const map = useMap()
  controllerRef.current = map
  return null
}

export default function FieldMap({ onPick }) {
  const [marker, setMarker] = useState(null)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchError, setSearchError] = useState('')
  const mapRef = useRef(null)
  const debounceRef = useRef(null)

  const handlePick = (lat, lon) => {
    setMarker([lat, lon])
    onPick(lat, lon)
  }

  // Debounced autocomplete effect.
  // Runs whenever `query` changes. Cancels any previous pending fetch so
  // fast typing doesn't queue up requests.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    // Skip short queries — they return too many noisy results and burn
    // Nominatim's rate limit for nothing.
    if (trimmed.length < 3) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(trimmed)}`,
        )
        if (!res.ok) throw new Error()
        const results = await res.json()
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      } catch {
        // Silent failure on autocomplete — the search button still works
        // for the manual path so we don't want to alarm the user.
        setSuggestions([])
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Called when the user clicks a suggestion from the dropdown.
  const handleSuggestionClick = (place) => {
    const latitude = parseFloat(place.lat)
    const longitude = parseFloat(place.lon)

    if (mapRef.current) {
      mapRef.current.setView([latitude, longitude], 10)
    }
    setMarker([latitude, longitude])
    onPick(latitude, longitude)

    // Show a short, clean label in the input instead of the full address.
    setQuery(place.display_name.split(',').slice(0, 3).join(','))
    setSuggestions([])
    setShowSuggestions(false)
    setSearchError('')
  }

  // Called when the user presses Enter / clicks Search. Fires a
  // one-shot lookup and jumps to the first result.
  const handleSubmit = async (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    setShowSuggestions(false)
    setSearchError('')

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      )
      if (!res.ok) throw new Error('Search is unavailable right now.')
      const results = await res.json()

      if (!results.length) {
        setSearchError(`No results for "${q}". Try a town or province name.`)
        return
      }

      handleSuggestionClick(results[0])
    } catch (err) {
      setSearchError(err.message || 'Search failed. Please try again.')
    }
  }

  return (
    <div className="container">
      <div className="field-map card">
        <div className="card-label">
          <span><Icon name="location" size={18} /> PICK YOUR INDAWO</span>
        </div>
        <p className="map-lede">
          Start typing a town, pick from the list, or tap anywhere on the map.
          Nuru will fetch the weather and recommend crops for that spot.
        </p>

        {/* Search box with autocomplete dropdown */}
        <form className="map-search" onSubmit={handleSubmit}>
          <Icon name="location" size={16} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length && setShowSuggestions(true)}
            // Delay hiding so a click on a suggestion still registers.
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search for a town or place…"
            aria-label="Search for a location"
            autoComplete="off"
          />
          <button type="submit" disabled={!query.trim()}>
            Search
          </button>

          {showSuggestions && suggestions.length > 0 && (
            <ul className="map-suggestions">
              {suggestions.map((place) => (
                <li key={place.place_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}  // stop the blur
                    onClick={() => handleSuggestionClick(place)}
                  >
                    <Icon name="location" size={13} />
                    <span>{place.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        {searchError && <p className="map-search-error">{searchError}</p>}

        <MapContainer
          center={[-28.5, 24.5]}
          zoom={5}
          style={{ height: '360px', width: '100%', borderRadius: '14px' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ClickPicker onPick={handlePick} />
          <MapController controllerRef={mapRef} />
          {marker && <Marker position={marker} />}
        </MapContainer>

        {marker && (
          <p className="map-status">
            <Icon name="check" size={16} />
            Selected: {marker[0].toFixed(4)}, {marker[1].toFixed(4)}
          </p>
        )}
      </div>
    </div>
  )
}
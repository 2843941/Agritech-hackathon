// FieldMap — interactive map for picking a field location.
//
// Why Leaflet: free, no API key, works offline-ish (tiles come from OSM).
// Google Maps needs a billing account; Leaflet doesn't.
//
// Design:
//   - The map starts centered on South Africa.
//   - Clicking anywhere drops a marker and fires onPick(lat, lon).
//   - The parent (App.jsx) passes onPick to loadFieldProfile(), so the
//     dashboard updates automatically with the clicked location's weather.
//   - We keep it deliberately simple — one marker, one click handler.

import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Icon from './Icon'

// Leaflet's default marker icon URLs are broken when bundled by Vite
// (they resolve relative to the CSS file, not the JS bundle). Fixing it
// by pointing to the CDN copies of the standard markers. This is a
// well-known Leaflet + bundler gotcha.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Small helper component that only exists to attach the click handler
// to the Leaflet map instance. Leaflet doesn't accept a plain onClick
// prop the way React elements do, so this is the idiomatic workaround.
function ClickPicker({ onPick }) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng
      onPick(lat, lng)
    },
  })
  return null
}

export default function FieldMap({ onPick }) {
  // Marker position — null until the user clicks. Once clicked, we show
  // a pin at the chosen spot so they can see where they tapped.
  const [marker, setMarker] = useState(null)

  const handlePick = (lat, lon) => {
    setMarker([lat, lon])
    onPick(lat, lon)
  }

  return (
    <div className="container">
      <div className="field-map card">
        <div className="card-label">
          <span><Icon name="location" size={18} /> PICK YOUR INDAWO</span>
        </div>
        <p className="map-lede">
          Tap anywhere on the map to set your field location. Nuru will fetch
          the weather and recommend crops for that spot.
        </p>

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

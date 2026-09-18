// MarketSnapshot — shows SA market prices for crops relevant to the picked
// field's province. Appears after a location is chosen.
//
// Data comes from /api/market-snapshot?lat=&lon=, which maps the coordinates
// to a province and returns that province's market rows. Falls back to a
// national snapshot when the province can't be determined.
//
// Prices are illustrative, not live feeds — labelled clearly in the card.

import { useEffect, useState } from 'react'
import Icon from './Icon'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function MarketSnapshot({ fieldProfile }) {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)

  const lat = fieldProfile?.location?.latitude
  const lon = fieldProfile?.location?.longitude

  useEffect(() => {
    if (!lat || !lon) {
      setRows([])
      setMeta(null)
      return
    }

    let cancelled = false

    const fetchMarket = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE_URL}/api/market-snapshot?lat=${lat}&lon=${lon}`)
        if (!res.ok) throw new Error('Market snapshot not available.')
        const data = await res.json()
        if (!cancelled) {
          setRows(data.market || [])
          setMeta({ province: data.province, location: data.market_location })
        }
      } catch {
        if (!cancelled) { setRows([]); setMeta(null) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchMarket()
    return () => { cancelled = true }
  }, [lat, lon])

  if (!lat || !lon) return null

  return (
    <div className="container">
      <div className="market-card card">
        <div className="card-label">
          <span><Icon name="leaf" size={18} /> MARKET SNAPSHOT</span>
          {meta?.location && <span className="source-label">{meta.location}</span>}
        </div>
        <p className="market-lede">
          Indicative prices for crops grown in{' '}
          {meta?.province ? <strong>{meta.province}</strong> : 'your region'}.
          Not a live market feed — use as a rough guide only.
        </p>

        {loading && <p className="market-loading">Fetching prices…</p>}

        {!loading && rows.length === 0 && (
          <p className="market-empty">No market data available for this location yet.</p>
        )}

        {rows.length > 0 && (
          <table className="market-table">
            <thead>
              <tr>
                <th>Crop</th>
                <th>Price / kg</th>
                <th>Demand</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.crop_name}</td>
                  <td>R{Number(row.price_per_kg).toFixed(2)}</td>
                  <td>
                    <span className={`demand-badge demand-${(row.demand_level || '').toLowerCase()}`}>
                      {row.demand_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

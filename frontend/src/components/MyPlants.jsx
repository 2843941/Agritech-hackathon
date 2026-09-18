// MyPlants — add, view, and delete plants. Writes to the same
// localStorage key that WateringReminders reads from ("nuru.plants"),
// so the two components stay in sync automatically.
//
// Data shape per plant:
//   { id, name, cropType, plantingDate, lastWatered, createdAt }

import { useState } from 'react'
import Icon from './Icon'
import { useLocalStorage } from '../lib/useLocalStorage'

// A short, curated list of SA staple crops. Keeps the demo tidy and
// avoids the messy "any string is fine" problem.
const CROP_OPTIONS = [
  'Maize', 'Wheat', 'Sorghum', 'Sunflower',
  'Spinach', 'Cabbage', 'Carrots', 'Tomatoes', 'Onions', 'Potatoes',
  'Beans', 'Peas', 'Pumpkin', 'Butternut',
  'Grapes', 'Citrus', 'Mango', 'Avocado',
  'Other',
]

// Turn a planting date into a rough "how far along" description.
// Weeks-based because that's how farmers talk about a crop's age.
function stageFromDate(plantingDate) {
  if (!plantingDate) return 'planted'
  const planted = new Date(plantingDate).getTime()
  const weeks = Math.floor((Date.now() - planted) / (7 * 24 * 60 * 60 * 1000))
  if (weeks < 2) return 'just planted'
  if (weeks < 6) return `growing (${weeks}w)`
  if (weeks < 12) return `established (${weeks}w)`
  return `ready soon (${weeks}w)`
}

export default function MyPlants() {
  const [plants, setPlants] = useLocalStorage('nuru.plants', [])
  const [name, setName] = useState('')
  const [cropType, setCropType] = useState(CROP_OPTIONS[0])
  const [plantingDate, setPlantingDate] = useState(
    new Date().toISOString().split('T')[0],  // today
  )

  const addPlant = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const newPlant = {
      id: crypto.randomUUID(),  // built-in browser UUID generator
      name: name.trim(),
      cropType,
      plantingDate,
      lastWatered: null,
      createdAt: new Date().toISOString(),
    }
    setPlants((current) => [newPlant, ...current])
    // Reset the form but keep the date (user probably adds several at once).
    setName('')
    setCropType(CROP_OPTIONS[0])
  }

  const deletePlant = (id) => {
    setPlants((current) => current.filter((p) => p.id !== id))
  }

  return (
    <div className="container">
      <div className="my-plants card">
        <div className="card-label">
          <span><Icon name="leaf" size={18} /> MY PLANTS</span>
          {plants.length > 0 && (
            <span className="plant-count">{plants.length}</span>
          )}
        </div>

        {/* Add plant form */}
        <form className="plant-add-form" onSubmit={addPlant}>
          <div className="plant-add-row">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Back garden bed 1"
                maxLength={60}
                required
              />
            </label>
            <label>
              <span>Crop</span>
              <select value={cropType} onChange={(e) => setCropType(e.target.value)}>
                {CROP_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <span>Planted</span>
              <input
                type="date"
                value={plantingDate}
                onChange={(e) => setPlantingDate(e.target.value)}
              />
            </label>
            <button type="submit" className="plant-add-button">
              <Icon name="leaf" size={16} /> Add plant
            </button>
          </div>
        </form>

        {/* Plants list */}
        {plants.length === 0 ? (
          <p className="plant-empty">
            No plants yet. Add your first one above and it'll appear in the
            watering reminders below.
          </p>
        ) : (
          <ul className="plant-list">
            {plants.map((plant) => (
              <li key={plant.id}>
                <div className="plant-info">
                  <strong>{plant.name}</strong>
                  <span className="plant-meta">
                    {plant.cropType} · {stageFromDate(plant.plantingDate)}
                  </span>
                </div>
                <button
                  className="plant-delete"
                  onClick={() => deletePlant(plant.id)}
                  aria-label={`Delete ${plant.name}`}
                  title="Remove plant"
                >
                  <Icon name="close" size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

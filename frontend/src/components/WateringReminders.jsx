// WateringReminders — a small dashboard card that tracks which of your
// saved plants need watering today.
//
// Design notes:
//   - Reads plants from the same localStorage key MyPlants will use later
//     ("nuru.plants") so the two components share state.
//   - If there are no plants yet, shows a friendly empty state and a
//     hint about where to add one.
//   - "Watered" button records the current timestamp on the plant object,
//     which persists via useLocalStorage automatically.
//   - Watering cadence: a plant is "due" if it hasn't been watered in
//     the last 2 days (rough default for most vegetables).

import Icon from './Icon'
import { useLocalStorage } from '../lib/useLocalStorage'

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export default function WateringReminders() {
  // Shared with MyPlants — key stays in one place so both components see
  // the same data.
  const [plants, setPlants] = useLocalStorage('nuru.plants', [])

  // Determine which plants are due. A plant is due when:
  //   - it has no lastWatered timestamp, OR
  //   - the timestamp is older than the 2-day threshold.
  const now = Date.now()
  const duePlants = plants.filter((plant) => {
    if (!plant.lastWatered) return true
    return now - new Date(plant.lastWatered).getTime() > TWO_DAYS_MS
  })

  // Called when the user taps "Water now" for a specific plant.
  // We update that plant in place, preserving everything else.
  const markWatered = (plantId) => {
    setPlants((current) =>
      current.map((plant) =>
        plant.id === plantId
          ? { ...plant, lastWatered: new Date().toISOString() }
          : plant,
      ),
    )
  }

  return (
    <div className="container">
      <div className="watering-card card">
        <div className="card-label">
          <span><Icon name="water" size={18} /> WATERING REMINDERS</span>
          {duePlants.length > 0 && (
            <span className="due-badge">{duePlants.length} due</span>
          )}
        </div>

        {plants.length === 0 && (
          <p className="watering-empty">
            No plants yet. Add one below to start tracking waterings.
          </p>
        )}

        {plants.length > 0 && duePlants.length === 0 && (
          <p className="watering-empty watering-good">
            <Icon name="check" size={16} /> All plants are watered. Nothing to do today.
          </p>
        )}

        {duePlants.length > 0 && (
          <ul className="watering-list">
            {duePlants.map((plant) => (
              <li key={plant.id}>
                <div>
                  <strong>{plant.name}</strong>
                  <span>
                    {plant.lastWatered
                      ? `Last watered ${Math.floor((now - new Date(plant.lastWatered).getTime()) / (24 * 60 * 60 * 1000))} days ago`
                      : 'Never watered yet'}
                  </span>
                </div>
                <button onClick={() => markWatered(plant.id)}>
                  <Icon name="water" size={15} /> Water now
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

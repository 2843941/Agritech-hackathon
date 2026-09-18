// FieldPage — everything about the field: weather, location picker,
// crop recommendations, market prices, watering reminders.
// Receives shared state as props from App.jsx (kept in one place to avoid
// React Context for the hackathon).

import FieldDashboard from '../components/FieldDashboard'
import FieldMap from '../components/FieldMap'
import CropRecommendations from '../components/CropRecommendations'
import MarketSnapshot from '../components/MarketSnapshot'
import WateringReminders from '../components/WateringReminders'
import { PlantManager } from '../components/PlantManager'

export default function FieldPage({
  fieldProfile,
  weather,
  locationStatus,
  locationLoading,
  onUseMyLocation,
  onMapPick,
  authToken,
  apiBaseUrl,
}) {
  return (
    <main>
      <FieldDashboard
        fieldProfile={fieldProfile}
        weather={weather}
        locationStatus={locationStatus}
        locationLoading={locationLoading}
        onUseMyLocation={onUseMyLocation}
      />
      <FieldMap onPick={onMapPick} />
      <CropRecommendations fieldProfile={fieldProfile} />
      <MarketSnapshot fieldProfile={fieldProfile} />
      <WateringReminders />
      <div className="container" style={{ marginTop: '2rem' }}>
        <PlantManager authToken={authToken} apiBaseUrl={apiBaseUrl} />
      </div>
    </main>
  )
}

// FieldPage — everything about the field: weather, location picker,
// crop recommendations, market prices, plants + watering reminders.

import FieldDashboard from '../components/FieldDashboard'
import FieldMap from '../components/FieldMap'
import CropRecommendations from '../components/CropRecommendations'
import MarketSnapshot from '../components/MarketSnapshot'
import MyPlants from '../components/MyPlants'
import WateringReminders from '../components/WateringReminders'

export default function FieldPage({
  fieldProfile,
  weather,
  locationStatus,
  locationLoading,
  onUseMyLocation,
  onMapPick,
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
      <MyPlants />
      <WateringReminders />
    </main>
  )
}
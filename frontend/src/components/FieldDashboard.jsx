import Icon from './Icon';

export default function FieldDashboard({
  fieldProfile, weather, locationStatus, locationLoading, onUseMyLocation,
}) {
  return (
    <section className="dashboard-section" id="field">
      <div className="container section-intro">
        <div>
          <div className="eyebrow dark"><span className="eyebrow-number">01</span> Your field dashboard</div>
          <h2>Start with the ground beneath you.</h2>
        </div>
        <p>Give Nuru a broad location to turn forecast, recent soil conditions and seasonal patterns into useful context for your next decision.</p>
      </div>
      <div className="container field-layout">
        <div className="field-profile card">
          <div className="card-label">
            <span><Icon name="location" size={18} /> FIELD PROFILE</span>
            {fieldProfile && <span className="live-badge"><i /> LIVE</span>}
          </div>
          <h3>{fieldProfile ? fieldProfile.location.label : 'Connect your location'}</h3>
          <p className="card-description">
            {fieldProfile ? fieldProfile.summary : 'We use your approximate coordinates to retrieve a live weather and seasonal context. You choose when to share it.'}
          </p>
          <button className="button button-dark" onClick={onUseMyLocation} disabled={locationLoading}>
            {locationLoading ? 'Reading your field…' : <><Icon name="location" size={18} /> Use my location</>}
          </button>
          {locationStatus && (
            <p className={`location-status ${fieldProfile ? 'success' : ''}`}>
              {fieldProfile && <Icon name="check" size={16} />}{locationStatus}
            </p>
          )}
          {fieldProfile && (
            <div className="season-strip">
              <div><span>SEASONAL SIGNAL</span><strong>{fieldProfile.history.period}</strong></div>
              <p>{fieldProfile.history.note}</p>
            </div>
          )}
        </div>
        <div className="weather-card card">
          <div className="weather-top">
            <div><span className="card-label-text">FIELD WEATHER</span><h3>{weather.condition}</h3></div>
            <span className="weather-icon"><Icon name="cloud" size={28} /></span>
          </div>
          <div className="weather-main"><strong>{weather.temperature}<small>°C</small></strong><span>Right now</span></div>
          <div className="weather-stats">
            <div><Icon name="water" size={18} /><span>Rain chance<strong>{weather.rainChance}</strong></span></div>
            <div><Icon name="wind" size={18} /><span>Wind<strong>{weather.wind}</strong></span></div>
          </div>
          <p className="weather-note">{weather.nextRain}</p>
        </div>
        <div className="soil-moisture card">
          <div className="card-label">
            <span><Icon name="water" size={18} /> SOIL MOISTURE</span>
            <span className="source-label">MODELLED</span>
          </div>
          <div className="moisture-display">
            <div className="moisture-ring">
              <strong>{weather.soilMoisture}</strong>
              {weather.soilMoisture !== '--' && <span>%</span>}
            </div>
            <div>
              <h3>{weather.soilMoisture === '--' ? 'Waiting for field data' : weather.soilMoisture > 55 ? 'Moisture is elevated' : weather.soilMoisture > 30 ? 'Comfortable moisture' : 'Moisture needs attention'}</h3>
              <p>{weather.soilMoisture === '--' ? 'Location-based soil moisture will appear here.' : 'Estimated at the surface; confirm in the field before irrigating.'}</p>
            </div>
          </div>
          {fieldProfile && (
            <div className="rain-history">
              <span>Typical {fieldProfile.history.period}</span>
              <strong>{fieldProfile.history.rainfall} mm rain</strong>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
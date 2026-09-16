import { useRef, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const starterQuestions = [
  'What can I plant this month?',
  'How should I prepare my soil?',
  'How can I protect seedlings from heavy rain?',
]

const defaultWeather = {
  temperature: '--',
  condition: 'Connect your field',
  wind: '--',
  rainChance: '--',
  soilMoisture: '--',
  nextRain: 'Use your location to see a live field snapshot.',
}

function Icon({ name, size = 20, stroke = 1.8 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    leaf: <><path d="M20.8 3.2C14.5 3.4 6.6 5.6 4.3 11.3c-1.4 3.5.2 7.3 3.7 8.5 3.8 1.3 7.7-.9 9.2-4.3 1.5-3.4 1.6-7.7 3.6-12.3Z" /><path d="M3.8 20.3c3-4.8 6.4-8 11.8-10.6" /></>,
    location: <><path d="M20 10.4c0 5.8-8 10.7-8 10.7s-8-4.9-8-10.7a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    camera: <><path d="M4 7.5h3l1.3-2h7.4l1.3 2h3A2 2 0 0 1 22 9.5v8A2 2 0 0 1 20 19.5H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13.5" r="3.5" /></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.5-.7L3 20l1.7-4.2A7.4 7.4 0 0 1 4 12a7.5 7.5 0 0 1 8-7.5 7.5 7.5 0 0 1 8 7Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    spark: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
    cloud: <><path d="M17.5 18.5H7a4.5 4.5 0 1 1 .9-8.9A5.7 5.7 0 0 1 19 11.5a3.5 3.5 0 0 1-1.5 7Z" /><path d="M8.5 21.2 7.6 22M12 21.2l-.8.8M15.5 21.2l-.8.8" /></>,
    water: <><path d="M12 2.5S5.4 10 5.4 14.3A6.6 6.6 0 0 0 18.6 14.3C18.6 10 12 2.5 12 2.5Z" /><path d="M8.8 14.5a3.2 3.2 0 0 0 3.2 3.1" /></>,
    wind: <><path d="M3 8h12.5a2.5 2.5 0 1 0-2.3-3.5" /><path d="M3 12h16.5a2.5 2.5 0 1 1-2.3 3.5" /><path d="M3 16h8" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    upload: <><path d="M12 16V3" /><path d="m7 8 5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
    pulse: <path d="M3 12h3l2-5 4 10 2.5-5H21" />,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function App() {
  const [weather, setWeather] = useState(defaultWeather)
  const [fieldProfile, setFieldProfile] = useState(null)
  const [locationStatus, setLocationStatus] = useState('')
  const [locationLoading, setLocationLoading] = useState(false)
  const [scanFile, setScanFile] = useState(null)
  const [scanPreview, setScanPreview] = useState('')
  const [scanResult, setScanResult] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello, I am Nuru. I can help you plan, observe and respond to the conditions in your field. What are you growing?' },
  ])
  const [messageInput, setMessageInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const fileInputRef = useRef(null)

  const requestJson = async (path, options) => {
    const response = await fetch(`${API_BASE_URL}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.detail || 'The service could not complete that request. Please try again.')
    return body
  }

  const loadFieldProfile = async (latitude, longitude) => {
    setLocationLoading(true)
    setLocationStatus('Building your local field profile…')
    try {
      const profile = await requestJson('/api/field-profile', { method: 'POST', body: JSON.stringify({ latitude, longitude }) })
      setFieldProfile(profile)
      setWeather(profile.weather)
      setLocationStatus(`Field profile ready for ${profile.location.label}.`)
    } catch (error) { setLocationStatus(error.message) } finally { setLocationLoading(false) }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocationStatus('This browser cannot provide location. Please use a device with location services enabled.'); return }
    setLocationStatus('Waiting for permission to read your location…')
    navigator.geolocation.getCurrentPosition(
      (position) => loadFieldProfile(position.coords.latitude, position.coords.longitude),
      (error) => setLocationStatus(error.code === 1 ? 'Location permission was not granted. You can still use the soil scanner and chat.' : 'We could not determine your location. Please try again outdoors or check device location services.'),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    )
  }

  const selectFile = (file) => {
    setScanError(''); setScanResult('')
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setScanError('Please choose a soil photo in JPG, PNG or WebP format.'); return }
    if (file.size > 8 * 1024 * 1024) { setScanError('Choose an image smaller than 8 MB so it can be analysed reliably.'); return }
    setScanFile(file); setScanPreview(URL.createObjectURL(file))
  }

  const scanSoil = async () => {
    if (!scanFile) { fileInputRef.current?.click(); return }
    setScanLoading(true); setScanError(''); setScanResult('')
    try {
      const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(scanFile) })
      const result = await requestJson('/api/soil-analysis', { method: 'POST', body: JSON.stringify({ image, mimeType: scanFile.type || 'image/jpeg', location: fieldProfile?.location?.label || 'not provided', weatherContext: fieldProfile?.summary || '' }) })
      setScanResult(result.answer)
    } catch (error) { setScanError(error.message) } finally { setScanLoading(false) }
  }

  const sendMessage = async (event, presetQuestion) => {
    event?.preventDefault()
    const text = (presetQuestion || messageInput).trim()
    if (!text || chatLoading) return
    const updatedMessages = [...messages, { role: 'user', text }]
    setMessages(updatedMessages); setMessageInput(''); setChatLoading(true); setChatError('')
    try {
      const result = await requestJson('/api/farm-chat', { method: 'POST', body: JSON.stringify({ message: text, history: updatedMessages.slice(-6), fieldContext: fieldProfile?.summary || 'No location data shared yet.' }) })
      setMessages((current) => [...current, { role: 'assistant', text: result.answer }])
    } catch (error) { setChatError(error.message); setMessages((current) => current.slice(0, -1)) } finally { setChatLoading(false) }
  }

  return (
    <main>
      <section className="hero-section" id="home">
        <nav className="nav container" aria-label="Main navigation">
          <a className="brand" href="#home" aria-label="Nuru home"><span className="brand-mark"><Icon name="leaf" size={23} /></span><span>NURU<span className="brand-sub">FIELD</span></span></a>
          <div className="nav-links"><a href="#field">Your field</a><a href="#soil">Soil scan</a><a href="#adviser">AI adviser</a></div>
          <a className="nav-action" href="#field">Open dashboard <Icon name="arrow" size={17} /></a>
        </nav>
        <div className="hero container">
          <div className="hero-copy"><div className="eyebrow"><span className="status-dot" /> Practical intelligence for every field</div><h1>Grow with a clearer<br /><em>view of your land.</em></h1><p className="hero-lede">Nuru Field brings local conditions, soil observations and practical farming guidance into one simple place—built with smallholder farmers in mind.</p><div className="hero-actions"><a className="button button-primary" href="#field">Explore your field <Icon name="arrow" size={18} /></a><a className="button button-quiet" href="#soil"><Icon name="camera" size={18} /> Scan soil</a></div><div className="trust-row"><span><Icon name="location" size={17} /> Your location stays in your control</span><span><Icon name="spark" size={17} /> AI guidance, not guesswork</span></div></div>
          <div className="hero-art" aria-hidden="true"><div className="sun-disc" /><div className="horizon" /><div className="hill hill-back" /><div className="hill hill-front" /><div className="plant plant-one"><i /><i /><i /><b /></div><div className="plant plant-two"><i /><i /><i /><b /></div><div className="plant plant-three"><i /><i /><i /><b /></div><div className="hero-card"><div className="hero-card-top"><span>FIELD PULSE</span><Icon name="pulse" size={17} /></div><strong>Plan with the season</strong><p>Local weather and soil context, together.</p><div className="mini-chart"><span /><span /><span /><span /><span /><span /><span /></div></div></div>
        </div>
      </section>
      <section className="dashboard-section" id="field">
        <div className="container section-intro"><div><div className="eyebrow dark"><span className="eyebrow-number">01</span> Your field dashboard</div><h2>Start with the ground beneath you.</h2></div><p>Give Nuru a broad location to turn forecast, recent soil conditions and seasonal patterns into useful context for your next decision.</p></div>
        <div className="container field-layout">
          <div className="field-profile card"><div className="card-label"><span><Icon name="location" size={18} /> FIELD PROFILE</span>{fieldProfile && <span className="live-badge"><i /> LIVE</span>}</div><h3>{fieldProfile ? fieldProfile.location.label : 'Connect your location'}</h3><p className="card-description">{fieldProfile ? fieldProfile.summary : 'We use your approximate coordinates to retrieve a live weather and seasonal context. You choose when to share it.'}</p><button className="button button-dark" onClick={useMyLocation} disabled={locationLoading}>{locationLoading ? 'Reading your field…' : <><Icon name="location" size={18} /> Use my location</>}</button>{locationStatus && <p className={`location-status ${fieldProfile ? 'success' : ''}`}>{fieldProfile && <Icon name="check" size={16} />}{locationStatus}</p>}{fieldProfile && <div className="season-strip"><div><span>SEASONAL SIGNAL</span><strong>{fieldProfile.history.period}</strong></div><p>{fieldProfile.history.note}</p></div>}</div>
          <div className="weather-card card"><div className="weather-top"><div><span className="card-label-text">FIELD WEATHER</span><h3>{weather.condition}</h3></div><span className="weather-icon"><Icon name="cloud" size={28} /></span></div><div className="weather-main"><strong>{weather.temperature}<small>°C</small></strong><span>Right now</span></div><div className="weather-stats"><div><Icon name="water" size={18} /><span>Rain chance<strong>{weather.rainChance}</strong></span></div><div><Icon name="wind" size={18} /><span>Wind<strong>{weather.wind}</strong></span></div></div><p className="weather-note">{weather.nextRain}</p></div>
          <div className="soil-moisture card"><div className="card-label"><span><Icon name="water" size={18} /> SOIL MOISTURE</span><span className="source-label">MODELLED</span></div><div className="moisture-display"><div className="moisture-ring"><strong>{weather.soilMoisture}</strong>{weather.soilMoisture !== '--' && <span>%</span>}</div><div><h3>{weather.soilMoisture === '--' ? 'Waiting for field data' : weather.soilMoisture > 55 ? 'Moisture is elevated' : weather.soilMoisture > 30 ? 'Comfortable moisture' : 'Moisture needs attention'}</h3><p>{weather.soilMoisture === '--' ? 'Location-based soil moisture will appear here.' : 'Estimated at the surface; confirm in the field before irrigating.'}</p></div></div>{fieldProfile && <div className="rain-history"><span>Typical {fieldProfile.history.period}</span><strong>{fieldProfile.history.rainfall} mm rain</strong></div>}</div>
        </div>
      </section>
      <section className="soil-section" id="soil"><div className="container soil-layout"><div className="soil-copy"><div className="eyebrow dark"><span className="eyebrow-number">02</span> See what is in front of you</div><h2>A closer look at your soil.</h2><p>A photo can help reveal visible texture, drainage clues, organic matter and surface condition. Nuru turns those observations into a practical next-step checklist.</p><div className="scan-note"><Icon name="spark" size={21} /><p><strong>Use this as a field guide.</strong> A photograph cannot measure pH, nutrients or contamination. For major decisions, combine it with a proper soil test.</p></div></div><div className="scanner card"><input ref={fileInputRef} id="soil-image" className="file-input" type="file" accept="image/*" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} />{scanPreview ? <div className="scan-preview"><img src={scanPreview} alt="Selected soil for analysis" /><button className="preview-remove" onClick={() => { setScanPreview(''); setScanFile(null); setScanResult('') }} aria-label="Remove selected image"><Icon name="close" size={18} /></button></div> : <label className="upload-area" htmlFor="soil-image"><span className="camera-puck"><Icon name="camera" size={28} /></span><strong>Take or upload a soil photo</strong><p>Fill the frame with a handful of soil in daylight.</p><span className="upload-link"><Icon name="upload" size={16} /> Choose a photo</span></label>}{scanPreview && <div className="scan-controls"><div><span className="file-name">{scanFile?.name}</span><span className="file-hint">Photo ready for review</span></div><button className="button button-dark" onClick={scanSoil} disabled={scanLoading}>{scanLoading ? 'Analysing…' : <><Icon name="spark" size={17} /> Analyse soil</>}</button></div>}{scanError && <p className="form-error">{scanError}</p>}{scanResult && <div className="scan-result"><div><span>AI SOIL OBSERVATION</span><Icon name="spark" size={18} /></div><p>{scanResult}</p></div>}</div></div></section>
      <section className="adviser-section" id="adviser"><div className="container adviser-layout"><div className="adviser-copy"><div className="eyebrow light"><span className="eyebrow-number">03</span> Ask your farming adviser</div><h2>One good question<br />can change a season.</h2><p>Chat with Nuru about crop choices, planting timing, soil care and weather preparation. It uses your field context only when you have connected it.</p><div className="adviser-points"><span><Icon name="check" size={17} /> Plain-language guidance</span><span><Icon name="check" size={17} /> Built for local decisions</span><span><Icon name="check" size={17} /> Encourages expert advice when needed</span></div></div><div className="chat-shell"><div className="chat-header"><div className="advisor-avatar"><Icon name="leaf" size={21} /></div><div><strong>Nuru, your field adviser</strong><span><i /> Ready to help</span></div><Icon name="spark" size={20} /></div><div className="messages" aria-live="polite">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><span>{message.text}</span></div>)}{chatLoading && <div className="message assistant typing"><span><i /><i /><i /></span></div>}</div>{messages.length < 3 && <div className="starter-questions">{starterQuestions.map((question) => <button key={question} onClick={() => sendMessage(null, question)}>{question} <Icon name="arrow" size={14} /></button>)}</div>}{chatError && <p className="form-error chat-error">{chatError}</p>}<form className="chat-form" onSubmit={sendMessage}><input value={messageInput} onChange={(event) => setMessageInput(event.target.value)} placeholder="Ask about your field…" aria-label="Ask Nuru a question" /><button aria-label="Send question" disabled={!messageInput.trim() || chatLoading}><Icon name="arrow" size={19} /></button></form></div></div></section>
      <section className="closing-section"><div className="container closing-content"><div className="closing-mark"><Icon name="leaf" size={37} /></div><div><h2>Better information. Stronger harvests.</h2><p>Start with your field, then make the next good decision.</p></div><a className="button button-primary" href="#field">Build my field profile <Icon name="arrow" size={18} /></a></div></section>
      <footer><div className="container footer-inner"><a className="brand footer-brand" href="#home"><span className="brand-mark"><Icon name="leaf" size={20} /></span><span>NURU<span className="brand-sub">FIELD</span></span></a><p>Made for thoughtful, resilient farming.</p><p className="footer-disclaimer">Guidance is informational. Verify crop, chemical and irrigation decisions with local agricultural professionals.</p></div></footer>
    </main>
  )
}

export default App

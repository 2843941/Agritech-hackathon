import { useRef, useState } from 'react';
import './App.css';
import Hero from './components/Hero';
import FieldDashboard from './components/FieldDashboard';
import SoilScanner from './components/SoilScanner';
import AdviserChat from './components/AdviserChat';
import Footer from './components/Footer';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const defaultWeather = {
  temperature: '--',
  condition: 'Connect your field',
  wind: '--',
  rainChance: '--',
  soilMoisture: '--',
  nextRain: 'Use your location to see a live field snapshot.',
};

export default function App() {
  const [weather, setWeather] = useState(defaultWeather);
  const [fieldProfile, setFieldProfile] = useState(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [scanFile, setScanFile] = useState(null);
  const [scanPreview, setScanPreview] = useState('');
  const [scanResult, setScanResult] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello, I am Nuru. I can help you plan, observe and respond to the conditions in your field. What are you growing?' },
  ]);
  const [messageInput, setMessageInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  const requestJson = async (path, options) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' }, ...options,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || 'The service could not complete that request. Please try again.');
    return body;
  };

  const loadFieldProfile = async (latitude, longitude) => {
    setLocationLoading(true);
    setLocationStatus('Building your local field profile…');
    try {
      const profile = await requestJson('/api/field-profile', {
        method: 'POST', body: JSON.stringify({ latitude, longitude }),
      });
      setFieldProfile(profile);
      setWeather(profile.weather);
      setLocationStatus(`Field profile ready for ${profile.location.label}.`);
    } catch (error) { setLocationStatus(error.message); }
    finally { setLocationLoading(false); }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('This browser cannot provide location. Please use a device with location services enabled.');
      return;
    }
    setLocationStatus('Waiting for permission to read your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => loadFieldProfile(pos.coords.latitude, pos.coords.longitude),
      (err) => setLocationStatus(
        err.code === 1
          ? 'Location permission was not granted. You can still use the soil scanner and chat.'
          : 'We could not determine your location. Please try again outdoors or check device location services.'
      ),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  };

  const selectFile = (file) => {
    setScanError(''); setScanResult('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setScanError('Please choose a soil photo in JPG, PNG or WebP format.'); return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setScanError('Choose an image smaller than 8 MB so it can be analysed reliably.'); return;
    }
    setScanFile(file); setScanPreview(URL.createObjectURL(file));
  };

  const scanSoil = async () => {
    if (!scanFile) return;
    setScanLoading(true); setScanError(''); setScanResult('');
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(scanFile);
      });
      const result = await requestJson('/api/soil-analysis', {
        method: 'POST',
        body: JSON.stringify({
          image,
          mimeType: scanFile.type || 'image/jpeg',
          location: fieldProfile?.location?.label || 'not provided',
          weatherContext: fieldProfile?.summary || '',
        }),
      });
      setScanResult(result.answer);
    } catch (error) { setScanError(error.message); }
    finally { setScanLoading(false); }
  };

  const removeScan = () => { setScanPreview(''); setScanFile(null); setScanResult(''); };

  const sendMessage = async (event, presetQuestion) => {
    event?.preventDefault();
    const text = (presetQuestion || messageInput).trim();
    if (!text || chatLoading) return;
    const updated = [...messages, { role: 'user', text }];
    setMessages(updated); setMessageInput(''); setChatLoading(true); setChatError('');
    try {
      const result = await requestJson('/api/farm-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          history: updated.slice(-6),
          fieldContext: fieldProfile?.summary || 'No location data shared yet.',
        }),
      });
      setMessages((current) => [...current, { role: 'assistant', text: result.answer }]);
    } catch (error) {
      setChatError(error.message);
      setMessages((current) => current.slice(0, -1));
    } finally { setChatLoading(false); }
  };

  return (
    <main>
      <Hero />
      <FieldDashboard
        fieldProfile={fieldProfile}
        weather={weather}
        locationStatus={locationStatus}
        locationLoading={locationLoading}
        onUseMyLocation={useMyLocation}
      />
      <SoilScanner
        scanFile={scanFile}
        scanPreview={scanPreview}
        scanResult={scanResult}
        scanLoading={scanLoading}
        scanError={scanError}
        onSelectFile={selectFile}
        onScan={scanSoil}
        onRemove={removeScan}
      />
      <AdviserChat
        messages={messages}
        messageInput={messageInput}
        chatLoading={chatLoading}
        chatError={chatError}
        onInputChange={setMessageInput}
        onSend={sendMessage}
        onPresetQuestion={(q) => sendMessage(null, q)}
      />
      <Footer />
    </main>
  );
}
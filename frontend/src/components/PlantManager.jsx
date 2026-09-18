import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Icon from './Icon';
import { CardSkeleton } from './Skeleton';

export const PlantManager = ({ authToken, apiBaseUrl }) => {
  const fileInputRef = useRef(null);
  const [plantFile, setPlantFile] = useState(null);
  const [plantPreview, setPlantPreview] = useState('');
  const [plantResult, setPlantResult] = useState('');
  const [plantLoading, setPlantLoading] = useState(false);
  const [plantError, setPlantError] = useState('');

  const handleSelectFile = (file) => {
    setPlantError('');
    setPlantResult('');
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPlantError('Please choose a plant photo in JPG, PNG or WebP format.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setPlantError('Choose an image smaller than 8 MB so it can be analysed reliably.');
      return;
    }

    setPlantFile(file);
    setPlantPreview(URL.createObjectURL(file));
  };

  const handleAnalyse = async () => {
    if (!plantFile) return;

    setPlantLoading(true);
    setPlantError('');
    setPlantResult('');

    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(plantFile);
      });
      const response = await fetch(`${apiBaseUrl}/api/plant-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          image,
          mimeType: plantFile.type || 'image/jpeg',
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || 'The plant photo could not be analysed.');
      setPlantResult(body.answer);
    } catch (error) {
      setPlantError(error.message || 'Unable to analyse this plant photo. Please try another image.');
    } finally {
      setPlantLoading(false);
    }
  };

  const handleRemove = () => {
    setPlantPreview('');
    setPlantFile(null);
    setPlantResult('');
    setPlantError('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <section className="plant-section" id="plants">
      <div className="container plant-layout">
        <div className="plant-copy">
          <div className="eyebrow dark"><span className="eyebrow-number">02</span> See what is growing in front of you</div>
          <h2>A closer look at your plants.</h2>
          <p> A photo can help reveal visible leaf stress, nutrient issues, canopy density and pest or disease signals. Nuru turns those observations into a practical next-step checklist.</p>
          <div className="scan-note">
            <Icon name="spark" size={21} />
            <p><strong>Use this as a crop guide.</strong> A photograph cannot measure nutrient levels or root health. For major decisions, combine it with a quick field check or agronomic test.</p>
          </div>
        </div>

        <div className="scanner plant-scanner card">
          <input
            ref={fileInputRef}
            id="plant-image"
            className="file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleSelectFile(e.target.files?.[0])}
          />

          {plantPreview ? (
            <div className="scan-preview">
              <img src={plantPreview} alt="Selected plant for analysis" />
              <button className="preview-remove" onClick={handleRemove} aria-label="Remove selected image">
                <Icon name="close" size={18} />
              </button>
            </div>
          ) : (
            <label className="upload-area plant-upload-area" htmlFor="plant-image">
              <span className="camera-puck"><Icon name="camera" size={28} /></span>
              <strong>Take or upload a plant photo</strong>
              <p>Fill the frame with a healthy leaf or crop section in daylight.</p>
              <span className="upload-link"><Icon name="upload" size={16} /> Choose a photo</span>
            </label>
          )}

          {plantPreview && (
            <div className="scan-controls">
              <div>
                <span className="file-name">{plantFile?.name}</span>
                <span className="file-hint">Photo ready for review</span>
              </div>
              <button className="button button-dark" onClick={handleAnalyse} disabled={plantLoading}>
                {plantLoading ? 'Analysing…' : <><Icon name="spark" size={17} /> Analyse plant</>}
              </button>
            </div>
          )}

          {plantLoading && !plantResult && (
            <div className="scan-result">
              <div><span>AI PLANT OBSERVATION</span><Icon name="spark" size={18} /></div>
              <CardSkeleton />
            </div>
          )}

          {plantError && (
            <div className="card-error">
              <strong>Error:</strong>
              <span>{plantError}</span>
            </div>
          )}

          {plantResult && (
            <div className="scan-result">
              <div><span>AI PLANT OBSERVATION</span><Icon name="spark" size={18} /></div>
              <div className="scan-result-content">
                <ReactMarkdown>{plantResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
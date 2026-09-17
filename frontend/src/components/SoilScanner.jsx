import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Icon from './Icon';

export default function SoilScanner({
  scanFile, scanPreview, scanResult, scanLoading, scanError,
  onSelectFile, onScan, onRemove,
}) {
  const fileInputRef = useRef(null);

  return (
    <section className="soil-section" id="soil">
      <div className="container soil-layout">
        <div className="soil-copy">
          <div className="eyebrow dark"><span className="eyebrow-number">02</span> See what is in front of you</div>
          <h2>A closer look at your soil.</h2>
          <p>A photo can help reveal visible texture, drainage clues, organic matter and surface condition. Nuru turns those observations into a practical next-step checklist.</p>
          <div className="scan-note">
            <Icon name="spark" size={21} />
            <p><strong>Use this as a field guide.</strong> A photograph cannot measure pH, nutrients or contamination. For major decisions, combine it with a proper soil test.</p>
          </div>
        </div>
        <div className="scanner card">
          <input
            ref={fileInputRef}
            id="soil-image"
            className="file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => onSelectFile(e.target.files?.[0])}
          />
          {scanPreview ? (
            <div className="scan-preview">
              <img src={scanPreview} alt="Selected soil for analysis" />
              <button className="preview-remove" onClick={onRemove} aria-label="Remove selected image">
                <Icon name="close" size={18} />
              </button>
            </div>
          ) : (
            <label className="upload-area" htmlFor="soil-image">
              <span className="camera-puck"><Icon name="camera" size={28} /></span>
              <strong>Take or upload a soil photo</strong>
              <p>Fill the frame with a handful of soil in daylight.</p>
              <span className="upload-link"><Icon name="upload" size={16} /> Choose a photo</span>
            </label>
          )}
          {scanPreview && (
            <div className="scan-controls">
              <div><span className="file-name">{scanFile?.name}</span><span className="file-hint">Photo ready for review</span></div>
              <button className="button button-dark" onClick={onScan} disabled={scanLoading}>
                {scanLoading ? 'Analysing…' : <><Icon name="spark" size={17} /> Analyse soil</>}
              </button>
            </div>
          )}
          {scanError && <p className="form-error">{scanError}</p>}
          {scanResult && (
            <div className="scan-result">
              <div><span>AI SOIL OBSERVATION</span><Icon name="spark" size={18} /></div>
              <div className="scan-result-content">
                <ReactMarkdown>{scanResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
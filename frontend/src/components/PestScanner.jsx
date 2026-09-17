import { useRef } from 'react';
import Icon from './Icon';

export default function PestScanner({
  pestFile, pestPreview, pestResult, pestLoading, pestError,
  onSelectFile, onScan, onRemove,
}) {
  const fileInputRef = useRef(null);

  return (
    <section className="pest-section" id="pest">
      <div className="container soil-layout">
        <div className="soil-copy">
          <div className="eyebrow dark"><span className="eyebrow-number">04</span> Something wrong with a plant?</div>
          <h2>Show Nuru what you can see.</h2>
          <p>Take a close photo of the affected leaf, stem or fruit in daylight. Nuru describes the visible signs and gives you a short list of things to check next.</p>
          <div className="scan-note">
            <Icon name="spark" size={21} />
            <p><strong>This is not a lab diagnosis.</strong> A photo cannot confirm a disease or pest. For chemical treatment, follow the product label and ask a local extension officer.</p>
          </div>
        </div>
        <div className="scanner card">
          <input
            ref={fileInputRef}
            id="pest-image"
            className="file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => onSelectFile(e.target.files?.[0])}
          />
          {pestPreview ? (
            <div className="scan-preview">
              <img src={pestPreview} alt="Selected plant for analysis" />
              <button className="preview-remove" onClick={onRemove} aria-label="Remove selected image">
                <Icon name="close" size={18} />
              </button>
            </div>
          ) : (
            <label className="upload-area" htmlFor="pest-image">
              <span className="camera-puck"><Icon name="camera" size={28} /></span>
              <strong>Take or upload a plant photo</strong>
              <p>Get close to the affected leaf in daylight.</p>
              <span className="upload-link"><Icon name="upload" size={16} /> Choose a photo</span>
            </label>
          )}
          {pestPreview && (
            <div className="scan-controls">
              <div><span className="file-name">{pestFile?.name}</span><span className="file-hint">Photo ready for review</span></div>
              <button className="button button-dark" onClick={onScan} disabled={pestLoading}>
                {pestLoading ? 'Analysing…' : <><Icon name="spark" size={17} /> Analyse plant</>}
              </button>
            </div>
          )}
          {pestError && <p className="form-error">{pestError}</p>}
          {pestResult && (
            <div className="scan-result">
              <div><span>AI PEST OBSERVATION</span><Icon name="spark" size={18} /></div>
              <p>{pestResult}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
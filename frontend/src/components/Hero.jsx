import Icon from './Icon';

export default function Hero() {
  return (
    <section className="hero-section" id="home">
      <nav className="nav container" aria-label="Main navigation">
        <a className="brand" href="#home" aria-label="Nuru home">
          <span className="brand-mark"><Icon name="leaf" size={23} /></span>
          <span>NURU<span className="brand-sub">FIELD</span></span>
        </a>
        <div className="nav-links">
          <a href="#field">Your field</a>
          <a href="#soil">Soil scan</a>
          <a href="#adviser">AI adviser</a>
        </div>
        <a className="nav-action" href="#field">Open dashboard <Icon name="arrow" size={17} /></a>
      </nav>
      <div className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> Practical intelligence for every field</div>
          <h1>Grow with a clearer<br /><em>view of your land.</em></h1>
          <p className="hero-lede">Nuru Field brings local conditions, soil observations and practical farming guidance into one simple place—built with smallholder farmers in mind.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#field">Explore your field <Icon name="arrow" size={18} /></a>
            <a className="button button-quiet" href="#soil"><Icon name="camera" size={18} /> Scan soil</a>
          </div>
          <div className="trust-row">
            <span><Icon name="location" size={17} /> Your location stays in your control</span>
            <span><Icon name="spark" size={17} /> AI guidance, not guesswork</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="horizon" />
          <div className="hill hill-back" />
          <div className="hill hill-front" />
          <div className="plant plant-one"><i /><i /><i /><b /></div>
          <div className="plant plant-two"><i /><i /><i /><b /></div>
          <div className="plant plant-three"><i /><i /><i /><b /></div>
          <div className="hero-card">
            <div className="hero-card-top"><span>FIELD PULSE</span><Icon name="pulse" size={17} /></div>
            <strong>Plan with the season</strong>
            <p>Local weather and soil context, together.</p>
            <div className="mini-chart"><span /><span /><span /><span /><span /><span /><span /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
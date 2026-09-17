import Icon from './Icon';

export default function Footer() {
  return (
    <>
      <section className="closing-section">
        <div className="container closing-content">
          <div className="closing-mark"><Icon name="leaf" size={37} /></div>
          <div>
            <h2>Better information. Stronger harvests.</h2>
            <p>Start with your field, then make the next good decision.</p>
          </div>
          <a className="button button-primary" href="#field">Build my field profile <Icon name="arrow" size={18} /></a>
        </div>
      </section>
      <footer>
        <div className="container footer-inner">
          <a className="brand footer-brand" href="#home">
            <span className="brand-mark"><Icon name="leaf" size={20} /></span>
            <span>NURU<span className="brand-sub">FIELD</span></span>
          </a>
          <p>Made for thoughtful, resilient farming.</p>
          <p className="footer-disclaimer">Guidance is informational. Verify crop, chemical and irrigation decisions with local agricultural professionals.</p>
        </div>
      </footer>
    </>
  );
}
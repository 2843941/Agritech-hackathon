// Nav — the top navigation bar. Shown on all authed pages.
//
// Two links: "Your field" (dashboard + map + crops + market + watering)
// and "Scan & Adviser" (soil scanner + chat, combined because they're
// both "observe and respond" tools).
//
// NavLink automatically applies an "active" class to whichever route is
// current, so we can style the active link without any state.

import { NavLink, Link } from 'react-router-dom'
import Icon from './Icon'

export default function Nav({ onSignOut }) {
  return (
    <nav className="app-nav">
      <div className="container app-nav-inner">
        <Link to="/field" className="app-nav-brand">
          <span className="brand-mark"><Icon name="leaf" size={20} /></span>
          <span>NURU<span className="brand-sub">FIELD</span></span>
        </Link>

        <div className="app-nav-links">
          <NavLink
            to="/field"
            className={({ isActive }) => 'app-nav-link' + (isActive ? ' active' : '')}
          >
            Your field
          </NavLink>
          <NavLink
            to="/scan"
            className={({ isActive }) => 'app-nav-link' + (isActive ? ' active' : '')}
          >
            Scan &amp; Adviser
          </NavLink>
        </div>

        <button className="app-nav-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </nav>
  )
}
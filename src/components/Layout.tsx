import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

const NAV = [
  ['/', 'Home'],
  ['/leaderboard', 'Leaderboard'],
  ['/races', 'Races'],
  ['/track', 'Track'],
  ['/drivers', 'Drivers'],
  ['/gallery', 'Gallery'],
] as const

export default function Layout() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <img src="/favicon.png" alt="" />
            <span>Race <b>Condition</b></span>
          </Link>
          <button
            className="menu-btn"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
          <nav className={open ? "open" : ""}>
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>{label}</NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="container"><Outlet /></main>
      <footer className="site-footer">
        <div className="container">
          <span>Race Condition · interest group in <a href="https://online.ntnu.no" target="_blank" rel="noreferrer">Online</a></span>
        </div>
      </footer>
    </>
  )
}

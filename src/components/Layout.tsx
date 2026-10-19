import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

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
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const pct = max > 0 ? Math.min(1, window.scrollY / max) : 0
      if (bar.current) bar.current.style.transform = `scaleX(${pct})`
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      ro.disconnect()
    }
  }, [])
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
        <div className="stripe"><div className="stripe-fill" ref={bar} /></div>
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

import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

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
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <img src="/logo.png" alt="" />
            <span>Race<b>Condition</b></span>
          </Link>
          <nav>
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
            ))}
          </nav>
        </div>
        <div className="stripe" />
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

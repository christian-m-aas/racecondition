import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useData } from '../lib/DataContext'
import { ACHIEVEMENTS } from '../lib/stats'
import type { DriverStats, RaceInfo, RankRow } from '../lib/stats'
import { formatDate, formatTime, isVideo, MEDALS } from '../lib/format'
import type { Driver } from '../lib/types'

export function Avatar({ driver, size = 44 }: { driver: Driver | undefined; size?: number }) {
  const initials = (driver?.name ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return driver?.photo_url ? (
    <img className="avatar" src={driver.photo_url} alt={driver.name} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>
  )
}

export function DriverLink({ driver, size }: { driver: Driver | undefined; size?: number }) {
  if (!driver) return <span>Unknown</span>
  return (
    <Link to={`/drivers/${driver.id}`} className="driver-link">
      <Avatar driver={driver} size={size} />
      <span>{driver.name}{driver.nickname ? <em> “{driver.nickname}”</em> : null}</span>
    </Link>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  )
}

export function LeaderTable({ rows, showGap = true }: { rows: RankRow[]; showGap?: boolean }) {
  const { data } = useData()
  if (!rows.length) return <p className="muted">No times registered yet.</p>
  return (
    <table className="table">
      <thead>
        <tr><th>Pos</th><th>Driver</th><th className="num">Best lap</th>{showGap && <th className="num">Gap</th>}<th className="num hide-sm">Heat</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const heat = data.heats.find((h) => h.id === r.heatId)
          return (
            <tr key={r.driverId} className={r.rank <= 3 ? `podium p${r.rank}` : ''}>
              <td className="pos">{r.rank}</td>
              <td><DriverLink driver={data.drivers.find((d) => d.id === r.driverId)} size={32} /></td>
              <td className="num mono">{formatTime(r.bestMs)}</td>
              {showGap && <td className="num mono muted">{r.rank === 1 ? '–' : `+${((r.bestMs - rows[0].bestMs) / 1000).toFixed(3)}`}</td>}
              <td className="num hide-sm muted">{heat ? `Heat ${heat.heat_number}` : '–'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function RaceCard({ info }: { info: RaceInfo }) {
  const { data } = useData()
  return (
    <article className="card race-card">
      <div className="eyebrow">{info.track?.name ?? 'Unknown track'}</div>
      <h3>{info.race.name}</h3>
      <div className="muted">{formatDate(info.race.race_date)} · {info.driverCount} drivers</div>
      <ol className="mini-podium">
        {info.ranking.slice(0, 3).map((r, i) => (
          <li key={r.driverId}>
            <span>{MEDALS[i]}</span>
            <span className="grow">{data.drivers.find((d) => d.id === r.driverId)?.name}</span>
            <span className="mono">{formatTime(r.bestMs)}</span>
          </li>
        ))}
      </ol>
      <Link className="btn" to={`/races/${info.race.id}`}>View race →</Link>
    </article>
  )
}

export function Achievements({ stats, onlyEarned = false }: { stats: DriverStats; onlyEarned?: boolean }) {
  const list = ACHIEVEMENTS.filter((a) => !onlyEarned || a.earned(stats))
  if (!list.length) return <p className="muted">No achievements yet.</p>
  return (
    <div className="achievements">
      {list.map((a) => (
        <div key={a.id} className={`achievement ${a.earned(stats) ? 'earned' : 'locked'}`} title={a.description}>
          <span className="ach-icon">{a.icon}</span>
          <div><strong>{a.title}</strong><small>{a.description}</small></div>
        </div>
      ))}
    </div>
  )
}

export function Loading() {
  const { loading, error } = useData()
  if (error) return <p className="error">Could not load data: {error}</p>
  return loading ? <p className="muted">Loading…</p> : null
}

export function Media({ url, caption, onOpen }: { url: string; caption?: string | null; onOpen?: () => void }) {
  return isVideo(url) ? (
    <video src={url} controls playsInline preload="metadata" aria-label={caption ?? 'Video'} />
  ) : (
    <img src={url} alt={caption ?? ''} loading="lazy" onClick={onOpen} />
  )
}

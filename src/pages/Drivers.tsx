import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { formatDate, formatTime, MEDALS } from '../lib/format'
import { Achievements, Avatar, Loading } from '../components/Shared'

export function Drivers() {
  const { data, analysis: a } = useData()
  const [query, setQuery] = useState('')
  const normalise = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = normalise(query.trim())
  const sorted = [...data.drivers]
    .filter((d) => !q || normalise(`${d.name} ${d.nickname ?? ''}`).includes(q))
    .sort((x, y) => {
    const sx = a.driverStats.get(x.id)!, sy = a.driverStats.get(y.id)!
    return (sy.wins - sx.wins) || (sy.podiums - sx.podiums) || (sy.races - sx.races) || x.name.localeCompare(y.name)
  })
  return (
    <>
      <h1 className="page-title">Drivers</h1>
      <div className="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input
          type="search"
          placeholder="Search drivers…"
          aria-label="Search drivers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Loading />
      {q && !sorted.length && <p className="muted">No drivers match “{query}”.</p>}
      <div className="grid four">
        {sorted.map((d) => {
          const s = a.driverStats.get(d.id)!
          return (
            <Link key={d.id} to={`/drivers/${d.id}`} className="card driver-card">
              <Avatar driver={d} size={96} />
              <h3>{d.name}</h3>
              {d.nickname && <div className="muted">“{d.nickname}”</div>}
              <dl className="stat-row">
                <div><dt>Races</dt><dd>{s.races}</dd></div>
                <div><dt>Wins</dt><dd>{s.wins}</dd></div>
                <div><dt>Podiums</dt><dd>{s.podiums}</dd></div>
              </dl>
              <div className="mono muted">PB {formatTime(s.bestMs)}</div>
            </Link>
          )
        })}
      </div>
    </>
  )
}

export function DriverProfile() {
  const { id } = useParams()
  const { data, analysis: a } = useData()
  const s = a.driverStats.get(Number(id))
  if (!s) return <><Loading /><p className="muted">Driver not found. <Link to="/drivers">Back to drivers</Link></p></>
  const d = s.driver
  const crashes = data.crashes.filter((c) => c.driver_id === d.id)
  const bestRank = s.history.reduce<number | null>((m, h) => (h.rank != null && (m == null || h.rank < m) ? h.rank : m), null)

  return (
    <>
      <Link to="/drivers" className="muted">← All drivers</Link>
      <div className="profile-head">
        <Avatar driver={d} size={140} />
        <div>
          <div className="eyebrow accent">{d.is_active ? 'Active driver' : 'Retired'}</div>
          <h1 className="page-title">{d.name}</h1>
          {d.nickname && <p className="muted">“{d.nickname}”</p>}
        </div>
      </div>

      <div className="stat-grid">
        {([
          ['Races', s.races],
          ['Wins', s.wins],
          ['Podiums', s.podiums],
          ['Personal best', formatTime(s.bestMs)],
          ['Avg. race best', formatTime(s.avgOfBestMs ? Math.round(s.avgOfBestMs) : null)],
          ['Top avg. speed', s.topSpeed != null ? `${s.topSpeed} km/h` : '–'],
          ['Best finish', bestRank ? `P${bestRank}` : '–'],
          ['Crashes', s.crashes],
          ['DNFs', s.dnfs],
          ['Track records', s.records],
        ] as const).map(([label, value]) => (
          <div key={label} className="card stat"><span>{label}</span><strong className={typeof value === 'string' ? 'mono' : ''}>{value}</strong></div>
        ))}
      </div>

      <h2>Achievements</h2>
      <Achievements stats={s} />

      <h2>Race history</h2>
      {s.history.length ? (
        <table className="table">
          <thead><tr><th>Race</th><th className="hide-sm">Date</th><th>Pos</th><th className="num">Best lap</th></tr></thead>
          <tbody>
            {[...s.history].reverse().map((h) => (
              <tr key={h.race.id}>
                <td><Link to={`/races/${h.race.id}`}>{h.race.name}</Link></td>
                <td className="hide-sm muted">{formatDate(h.race.race_date)}</td>
                <td className="pos">{h.rank ? (h.rank <= 3 ? MEDALS[h.rank - 1] : h.rank) : 'DNF'}</td>
                <td className="num mono">{formatTime(h.bestMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">No races yet.</p>}

      {crashes.length > 0 && (
        <>
          <h2>Crashes 💥</h2>
          <ul className="plain">
            {crashes.map((c) => (
              <li key={c.id}>{data.races.find((r) => r.id === c.race_id)?.name}{c.description ? ` – ${c.description}` : ''}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

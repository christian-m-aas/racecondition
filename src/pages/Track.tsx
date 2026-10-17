import { useState } from 'react'
import { useData } from '../lib/DataContext'
import { formatTime } from '../lib/format'
import { Loading } from '../components/Shared'

export default function Track() {
  const { data, analysis: a } = useData()
  const [trackId, setTrackId] = useState<number | null>(null)
  const [crashId, setCrashId] = useState<number | null>(null)
  const track = data.tracks.find((t) => t.id === (trackId ?? a.lastRace?.track?.id)) ?? data.tracks[0]
  const crashes = track
    ? data.crashes.filter((c) => data.races.find((r) => r.id === c.race_id)?.track_id === track.id)
    : []
  const selected = crashes.find((c) => c.id === crashId)
  const record = a.records.find((r) => r.track?.id === track?.id)

  return (
    <>
      <h1 className="page-title">Track</h1>
      <Loading />
      {data.tracks.length > 1 && (
        <select value={track?.id} onChange={(e) => setTrackId(Number(e.target.value))}>
          {data.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {track && (
        <div className="grid two track-grid">
          <div className="card trackmap">
            {track.svg_url ? (
              <div className="map-wrap">
                <img src={track.svg_url} alt={`Map of ${track.name}`} />
                {/* Crash markers use x/y as percentages (0–100) of the map. */}
                {crashes.map((c) => (
                  <button key={c.id} className={`marker ${c.id === crashId ? 'active' : ''}`} style={{ left: `${c.x}%`, top: `${c.y}%` }} onClick={() => setCrashId(c.id)} aria-label="Crash">💥</button>
                ))}
              </div>
            ) : (
              <div className="map-placeholder">Track map coming soon 🏎️</div>
            )}
          </div>
          <div>
            <h2>{track.name}</h2>
            {track.location && <p className="muted">{track.location}</p>}
            {record && <p>Track record: <strong className="mono">{formatTime(record.ms)}</strong> – {data.drivers.find((d) => d.id === record.driverId)?.name}</p>}
            <h3>Crashes ({crashes.length})</h3>
            {selected && (
              <div className="card">
                <strong>{data.drivers.find((d) => d.id === selected.driver_id)?.name}</strong>
                <div className="muted">{data.races.find((r) => r.id === selected.race_id)?.name}{selected.turn_name ? ` · ${selected.turn_name}` : ''}{selected.lap_number ? ` · lap ${selected.lap_number}` : ''}</div>
                {selected.description && <p>{selected.description}</p>}
              </div>
            )}
            <ul className="plain">
              {crashes.map((c) => (
                <li key={c.id}><button className="link" onClick={() => setCrashId(c.id)}>{data.drivers.find((d) => d.id === c.driver_id)?.name}{c.turn_name ? ` – ${c.turn_name}` : ''}</button></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

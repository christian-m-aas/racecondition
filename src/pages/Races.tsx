import { Link, useParams } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { formatDate, formatTime } from '../lib/format'
import { heatStanding } from '../lib/stats'
import { DriverLink, LeaderTable, Loading, Media, RaceCard } from '../components/Shared'

export function Races() {
  const { analysis: a } = useData()
  return (
    <>
      <h1 className="page-title">Races</h1>
      <Loading />
      <div className="grid three">
        {[...a.completed].reverse().map((info) => <RaceCard key={info.race.id} info={info} />)}
      </div>
      {!a.completed.length && <p className="muted">No completed races yet.</p>}
    </>
  )
}

export function RaceDetail() {
  const { id } = useParams()
  const { data, analysis: a } = useData()
  const info = a.raceInfo.get(Number(id))
  if (!info) return <><Loading /><p className="muted">Race not found. <Link to="/races">Back to races</Link></p></>

  const heats = data.heats.filter((h) => h.race_id === info.race.id).sort((x, y) => x.heat_number - y.heat_number)
  const photos = data.photos.filter((p) => p.race_id === info.race.id)
  const crashes = data.crashes.filter((c) => c.race_id === info.race.id)
  const results = data.results.filter((r) => r.race_id === info.race.id)

  return (
    <>
      <Link to="/races" className="muted">← All races</Link>
      <div className="eyebrow accent">{info.track?.name}</div>
      <h1 className="page-title">{info.race.name}</h1>
      <p className="muted">{formatDate(info.race.race_date)} · {info.driverCount} drivers</p>
      {info.race.description && <p>{info.race.description}</p>}

      <h2>Overall result</h2>
      <LeaderTable rows={info.ranking} />

      {heats.map((h) => {
        const rows = heatStanding(results.filter((r) => r.heat_id === h.id))
        return (
          <section key={h.id}>
            <h2>Heat {h.heat_number}{h.name ? ` – ${h.name}` : ''}</h2>
            <table className="table">
              <thead><tr><th>Pos</th><th>Driver</th><th className="num">Best</th><th className="num hide-sm">Kart</th></tr></thead>
              <tbody>
                {rows.map(({ result: r, position }) => (
                  <tr key={r.id}>
                    <td className="pos">{r.dnf ? 'DNF' : position ?? '–'}</td>
                    <td><DriverLink driver={data.drivers.find((d) => d.id === r.driver_id)} size={32} /></td>
                    <td className="num mono">{formatTime(r.best_lap_time_ms)}</td>
                    <td className="num hide-sm">{r.kart_number ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}

      {crashes.length > 0 && (
        <section>
          <h2>Crashes 💥</h2>
          <ul className="plain">
            {crashes.map((c) => (
              <li key={c.id}>
                <strong>{data.drivers.find((d) => d.id === c.driver_id)?.name}</strong>
                {c.description ? ` – ${c.description}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {photos.length > 0 && (
        <section>
          <h2>Photos</h2>
          <div className="gallery">
            {photos.map((p) => (
              <figure key={p.id}><Media url={p.image_url} caption={p.caption} />{p.caption && <figcaption>{p.caption}</figcaption>}</figure>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { generateFacts } from '../lib/stats'
import { daysUntil, formatDate, formatTime } from '../lib/format'
import { DriverLink, Loading, RaceCard, SectionTitle } from '../components/Shared'

export default function Home() {
  const { data, analysis: a, loading } = useData()
  const facts = useMemo(() => generateFacts(data, a), [data, a])
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * 1000))
  const fact = facts.length ? facts[idx % facts.length] : undefined

  const next = a.nextRace
  const record =
    (next && a.records.find((r) => r.track?.id === next.track_id)) ??
    (a.lastRace && a.records.find((r) => r.track?.id === a.lastRace!.track?.id)) ??
    a.records[0]
  const days = next ? daysUntil(next.race_date) : null

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <img className="hero-logo" src="/logo.png" alt="Race Condition logo" />
          <h1 className="logo-text">Race <span>Condition</span></h1>
          <div className="row">
            <Link className="btn primary" to="/leaderboard">Leaderboard</Link>
            <Link className="btn" to="/races">Past races</Link>
          </div>
        </div>
        <aside className="card next-race">
          <div className="eyebrow accent">Next race</div>
          {next ? (
            <>
              <h3>{next.name}</h3>
              <div className="countdown">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}</div>
              <div className="muted">{formatDate(next.race_date)}</div>
              <div>{next.track?.name}{next.track?.location ? ` · ${next.track.location}` : ''}</div>
              {next.description && <p className="muted">{next.description}</p>}
            </>
          ) : (
            <p className="muted">No race scheduled yet. Stay tuned!</p>
          )}
        </aside>
      </section>

      <Loading />
      {!loading && (
        <>
          <div className="grid two">
            <div>
              <SectionTitle>Latest race</SectionTitle>
              {a.lastRace ? <RaceCard info={a.lastRace} /> : <p className="muted">No races registered yet.</p>}
            </div>
            <div>
              <SectionTitle>Current track record</SectionTitle>
              {record ? (
                <article className="card record">
                  <div className="eyebrow">{record.track?.name}</div>
                  <div className="record-time mono">{formatTime(record.ms)}</div>
                  <DriverLink driver={data.drivers.find((d) => d.id === record.driverId)} size={48} />
                  <div className="muted">{data.races.find((r) => r.id === record.raceId)?.name}</div>
                </article>
              ) : (
                <p className="muted">No lap times yet.</p>
              )}
            </div>
          </div>

          {fact && (
            <aside className="card fact">
              <div className="eyebrow accent">{idx % 2 ? 'Random race fact' : 'Did you know?'}</div>
              <p>{fact}</p>
              {facts.length > 1 && <button className="btn small" onClick={() => setIdx((i) => i + 1)}>Another fact ↻</button>}
            </aside>
          )}
        </>
      )}
    </>
  )
}

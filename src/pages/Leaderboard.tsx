import { useState } from 'react'
import { useData } from '../lib/DataContext'
import { rankResults } from '../lib/stats'
import { formatDate } from '../lib/format'
import { LeaderTable, Loading, SectionTitle } from '../components/Shared'

export default function Leaderboard() {
  const { data, analysis: a } = useData()
  const [tab, setTab] = useState<'last' | 'all'>('last')
  const [trackId, setTrackId] = useState<number | 'all'>('all')

  const allRows =
    trackId === 'all'
      ? a.allTime
      : rankResults(data.results.filter((r) => data.races.find((x) => x.id === r.race_id)?.track_id === trackId))

  return (
    <>
      <h1 className="page-title">Leaderboard</h1>
      <Loading />
      <div className="tabs">
        <button className={tab === 'last' ? 'active' : ''} onClick={() => setTab('last')}>Last race</button>
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All-time fastest</button>
      </div>
      {tab === 'last' ? (
        a.lastRace ? (
          <>
            <SectionTitle>{a.lastRace.race.name}</SectionTitle>
            <p className="muted">{a.lastRace.track?.name} · {formatDate(a.lastRace.race.race_date)} · each driver’s best lap across all heats</p>
            <LeaderTable rows={a.lastRace.ranking} />
          </>
        ) : <p className="muted">No races yet.</p>
      ) : (
        <>
          <SectionTitle
            action={
              data.tracks.length > 1 && (
              <select value={trackId} onChange={(e) => setTrackId(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">All tracks</option>
                {data.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              )
            }
          >All-time fastest</SectionTitle>
          <p className="muted">Each driver’s best lap ever</p>
          <LeaderTable rows={allRows} />
        </>
      )}
    </>
  )
}

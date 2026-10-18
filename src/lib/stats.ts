import type { Data, Driver, Race, Result, Track } from './types'
import { formatTime, ordinal, todayISO } from './format'

export interface RankRow {
  driverId: number
  rank: number
  bestMs: number
  avgMs: number | null
  heatId: number | null
  kart: number | null
}

export interface RaceInfo {
  race: Race
  track: Track | undefined
  ranking: RankRow[]
  /** Number of distinct drivers with a result in the race (including DNF). */
  driverCount: number
}

export interface RecordRow {
  track: Track | undefined
  driverId: number
  ms: number
  raceId: number
}

export interface DriverStats {
  driver: Driver
  races: number
  wins: number
  seconds: number
  podiums: number
  crashes: number
  dnfs: number
  bestMs: number | null
  avgOfBestMs: number | null
  history: { race: Race; rank: number | null; bestMs: number | null }[]
  longestPodiumStreak: number
  records: number
}

export interface Achievement {
  id: string
  icon: string
  title: string
  description: string
  earned: (s: DriverStats) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'record', icon: '🏆', title: 'Track Record', description: 'Holds the fastest lap ever on a track', earned: (s) => s.records > 0 },
  { id: 'win', icon: '🥇', title: 'First Place', description: 'Won a race', earned: (s) => s.wins > 0 },
  { id: 'podium', icon: '🥉', title: 'Podium Finisher', description: 'Finished on the podium', earned: (s) => s.podiums > 0 },
  { id: 'streak', icon: '🔥', title: 'Hot Streak', description: '3 podiums in a row', earned: (s) => s.longestPodiumStreak >= 3 },
  { id: 'dominator', icon: '👑', title: 'Dominator', description: 'Won 3 races', earned: (s) => s.wins >= 3 },
  { id: 'rookie', icon: '🚦', title: 'Lights Out', description: 'Completed a first race', earned: (s) => s.races >= 1 },
  { id: 'ironman', icon: '🏁', title: 'Ironman', description: 'Participated in 10 races', earned: (s) => s.races >= 10 },
  { id: 'crash', icon: '💥', title: 'Crash Test Dummy', description: 'Crashed 3 times', earned: (s) => s.crashes >= 3 },
]

const byDate = (a: Race, b: Race) =>
  a.race_date === b.race_date ? a.id - b.id : a.race_date < b.race_date ? -1 : 1

export function bestPerDriver(results: Result[]): Result[] {
  const best = new Map<number, Result>()
  for (const r of results) {
    if (r.dnf || r.best_lap_time_ms == null) continue
    const cur = best.get(r.driver_id)
    if (!cur || r.best_lap_time_ms < cur.best_lap_time_ms!) best.set(r.driver_id, r)
  }
  return [...best.values()].sort((a, b) => a.best_lap_time_ms! - b.best_lap_time_ms!)
}

export function rankResults(results: Result[]): RankRow[] {
  return bestPerDriver(results).map((r, i) => ({
    driverId: r.driver_id,
    rank: i + 1,
    bestMs: r.best_lap_time_ms!,
    avgMs: r.average_lap_time_ms,
    heatId: r.heat_id,
    kart: r.kart_number,
  }))
}

export interface Analysis {
  /** Races that have results, oldest first. */
  completed: RaceInfo[]
  lastRace: RaceInfo | undefined
  nextRace: (Race & { track: Track | undefined }) | undefined
  records: RecordRow[]
  allTime: RankRow[]
  driverStats: Map<number, DriverStats>
  raceInfo: Map<number, RaceInfo>
}

export function analyse(data: Data): Analysis {
  const trackById = new Map(data.tracks.map((t) => [t.id, t]))
  const driverById = new Map(data.drivers.map((d) => [d.id, d]))

  const resultsByRace = new Map<number, Result[]>()
  for (const r of data.results) {
    if (!resultsByRace.has(r.race_id)) resultsByRace.set(r.race_id, [])
    resultsByRace.get(r.race_id)!.push(r)
  }

  const completed: RaceInfo[] = data.races
    .filter((r) => resultsByRace.has(r.id))
    .sort(byDate)
    .map((race) => {
      const res = resultsByRace.get(race.id)!
      return {
        race,
        track: trackById.get(race.track_id),
        ranking: rankResults(res),
        driverCount: new Set(res.map((r) => r.driver_id)).size,
      }
    })
  const raceInfo = new Map(completed.map((c) => [c.race.id, c]))

  const today = todayISO()
  const next = data.races
    .filter((r) => !resultsByRace.has(r.id) && r.race_date >= today)
    .sort(byDate)[0]

  // Track records: fastest valid lap per track.
  const recordMap = new Map<number, RecordRow>()
  for (const r of data.results) {
    if (r.dnf || r.best_lap_time_ms == null) continue
    const race = data.races.find((x) => x.id === r.race_id)
    if (!race) continue
    const cur = recordMap.get(race.track_id)
    if (!cur || r.best_lap_time_ms < cur.ms) {
      recordMap.set(race.track_id, {
        track: trackById.get(race.track_id),
        driverId: r.driver_id,
        ms: r.best_lap_time_ms,
        raceId: race.id,
      })
    }
  }
  const records = [...recordMap.values()].sort((a, b) => a.ms - b.ms)

  const driverStats = new Map<number, DriverStats>()
  for (const driver of data.drivers) {
    const history: DriverStats['history'] = []
    for (const info of completed) {
      const row = info.ranking.find((x) => x.driverId === driver.id)
      const took = data.results.some((r) => r.race_id === info.race.id && r.driver_id === driver.id)
      if (took) history.push({ race: info.race, rank: row?.rank ?? null, bestMs: row?.bestMs ?? null })
    }
    const mine = data.results.filter((r) => r.driver_id === driver.id)
    const valid = mine.filter((r) => !r.dnf && r.best_lap_time_ms != null)
    const raceBests = history.filter((h) => h.bestMs != null).map((h) => h.bestMs!)
    let streak = 0
    let longest = 0
    for (const h of history) {
      streak = h.rank != null && h.rank <= 3 ? streak + 1 : 0
      longest = Math.max(longest, streak)
    }
    driverStats.set(driver.id, {
      driver,
      races: history.length,
      wins: history.filter((h) => h.rank === 1).length,
      seconds: history.filter((h) => h.rank === 2).length,
      podiums: history.filter((h) => h.rank != null && h.rank <= 3).length,
      crashes: data.crashes.filter((c) => c.driver_id === driver.id).length,
      dnfs: mine.filter((r) => r.dnf).length,
      bestMs: valid.length ? Math.min(...valid.map((r) => r.best_lap_time_ms!)) : null,
      avgOfBestMs: raceBests.length ? raceBests.reduce((a, b) => a + b, 0) / raceBests.length : null,
      history,
      longestPodiumStreak: longest,
      records: records.filter((r) => r.driverId === driver.id).length,
    })
  }

  return {
    completed,
    lastRace: completed[completed.length - 1],
    nextRace: next ? { ...next, track: trackById.get(next.track_id) } : undefined,
    records,
    allTime: rankResults(data.results.filter((r) => driverById.has(r.driver_id))),
    driverStats,
    raceInfo,
  }
}

/** Fun facts generated from the data. */
export function generateFacts(data: Data, a: Analysis): string[] {
  const facts: string[] = []
  const stats = [...a.driverStats.values()].filter((s) => s.races > 0)
  const name = (id: number) => a.driverStats.get(id)?.driver.name ?? 'Someone'
  if (!stats.length) return facts

  const top = (key: (s: DriverStats) => number) => {
    const sorted = [...stats].sort((x, y) => key(y) - key(x))
    return sorted[0] && key(sorted[0]) > 0 && key(sorted[0]) > (sorted[1] ? key(sorted[1]) : 0)
      ? sorted[0]
      : undefined
  }

  const wins = top((s) => s.wins)
  if (wins) facts.push(`${wins.driver.name} has won ${wins.wins} race${wins.wins > 1 ? 's' : ''} – more than anyone else.`)
  const seconds = top((s) => s.seconds)
  if (seconds) facts.push(`${seconds.driver.name} has finished 2nd more times than anyone else (${seconds.seconds}).`)
  const podiums = top((s) => s.podiums)
  if (podiums) facts.push(`${podiums.driver.name} leads the podium count with ${podiums.podiums} podiums.`)
  const crashes = top((s) => s.crashes)
  if (crashes) facts.push(`${crashes.driver.name} has crashed ${crashes.crashes} times – the most on the grid.`)
  const iron = top((s) => s.races)
  if (iron) facts.push(`${iron.driver.name} has taken part in ${iron.races} races, more than anyone else.`)

  // Longest run of consecutive race wins.
  let run = 0
  let best = { n: 0, id: -1 }
  let prev = -1
  for (const info of a.completed) {
    const w = info.ranking[0]?.driverId ?? -1
    run = w === prev && w !== -1 ? run + 1 : 1
    prev = w
    if (w !== -1 && run > best.n) best = { n: run, id: w }
  }
  if (best.n >= 2) facts.push(`${name(best.id)} has the fastest lap in ${best.n} consecutive races.`)

  for (const rec of a.records) {
    facts.push(`${name(rec.driverId)} holds the track record at ${rec.track?.name ?? 'an unknown track'}: ${formatTime(rec.ms)}.`)
  }

  // Closest finish.
  let closest: { gap: number; info: (typeof a.completed)[number] } | undefined
  for (const info of a.completed) {
    if (info.ranking.length < 2) continue
    const gap = info.ranking[1].bestMs - info.ranking[0].bestMs
    if (!closest || gap < closest.gap) closest = { gap, info }
  }
  if (closest) {
    const [p1, p2] = closest.info.ranking
    facts.push(`Closest race ever: ${name(p1.driverId)} beat ${name(p2.driverId)} by just ${(closest.gap / 1000).toFixed(3)} s in ${closest.info.race.name}.`)
  }

  const comeback = stats.find((s) => s.history.length >= 2 && s.history.at(-1)!.rank === 1 && (s.history.at(-2)!.rank ?? 0) > 3)
  if (comeback) facts.push(`${comeback.driver.name} went from ${ordinal(comeback.history.at(-2)!.rank!)} to 1st in the last race.`)

  void data
  return facts
}

/** Orders one heat's results by best lap (DNF / no time last) and derives the positions. */
export function heatStanding(results: Result[]): { result: Result; position: number | null }[] {
  const timed = (r: Result) => !r.dnf && r.best_lap_time_ms != null
  const sorted = [...results].sort(
    (a, b) => Number(!timed(a)) - Number(!timed(b)) || (a.best_lap_time_ms ?? 0) - (b.best_lap_time_ms ?? 0),
  )
  return sorted.map((result, i) => ({ result, position: timed(result) ? i + 1 : null }))
}

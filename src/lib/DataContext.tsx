import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import { analyse } from './stats'
import type { Analysis } from './stats'
import type { Data } from './types'

const EMPTY: Data = { drivers: [], tracks: [], races: [], heats: [], results: [], crashes: [], photos: [] }

interface Ctx {
  data: Data
  analysis: Analysis
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const DataCtx = createContext<Ctx | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const q = (table: string) => supabase.from(table).select('*')
    const [drivers, tracks, races, heats, results, crashes, photos] = await Promise.all([
      q('drivers').order('name'),
      q('tracks').order('name'),
      q('races'),
      q('heats'),
      q('race_results'),
      q('crashes'),
      q('race_photos').order('created_at', { ascending: false }),
    ])
    const failed = [drivers, tracks, races, heats, results, crashes].find((r) => r.error)
    if (failed?.error) setError(failed.error.message)
    else setError(null)
    setData({
      drivers: drivers.data ?? [],
      tracks: tracks.data ?? [],
      races: races.data ?? [],
      heats: heats.data ?? [],
      results: results.data ?? [],
      crashes: crashes.data ?? [],
      // The gallery table is optional until supabase/setup.sql has been run.
      photos: photos.data ?? [],
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const analysis = useMemo(() => analyse(data), [data])
  const value = useMemo(() => ({ data, analysis, loading, error, reload }), [data, analysis, loading, error, reload])
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): Ctx {
  const ctx = useContext(DataCtx)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

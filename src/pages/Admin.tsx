import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, uploadImage } from '../lib/supabase'
import { useData } from '../lib/DataContext'
import { formatTime, isVideo, parseTime } from '../lib/format'
import type { Heat } from '../lib/types'

type Row = Record<string, unknown>
interface Field {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'image' | 'textarea'
  options?: { value: number; label: string }[]
  required?: boolean
  step?: string
}

function useAdmin() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    void supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(!!data))
  }, [session])

  return { session, isAdmin: session ? isAdmin : false, ready }
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setError(error ? error.message : '')
  }
  return (
    <form className="card login" onSubmit={submit}>
      <h2>Admin login</h2>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary">Sign in</button>
    </form>
  )
}

/** Generic create / edit / delete for one table. */
function Crud({ table, fields, rows, columns, defaults = {} }: {
  table: string
  fields: Field[]
  rows: object[]
  columns: (row: Row) => string[]
  defaults?: Row
}) {
  const { reload } = useData()
  const [form, setForm] = useState<Row>(defaults)
  const [editing, setEditing] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }))
  const reset = () => { setForm(defaults); setEditing(null) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const payload: Row = {}
    for (const f of fields) {
      const v = form[f.key]
      if (f.type === 'checkbox') payload[f.key] = !!v
      else if (v === '' || v == null) payload[f.key] = null
      else payload[f.key] = f.type === 'number' || f.type === 'select' ? Number(v) : v
    }
    const q = editing == null ? supabase.from(table).insert(payload) : supabase.from(table).update(payload).eq('id', editing)
    const { error } = await q
    setMsg(error ? error.message : 'Saved ✓')
    if (!error) { reset(); await reload() }
  }

  async function remove(id: number) {
    if (!confirm('Delete this? This cannot be undone.')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    setMsg(error ? error.message : 'Deleted')
    if (!error) await reload()
  }

  async function upload(key: string, file: File | undefined) {
    if (!file) return
    setBusy(true)
    try { set(key, await uploadImage(file, table)) } catch (err) { setMsg((err as Error).message) }
    setBusy(false)
  }

  return (
    <div>
      <form className="card admin-form" onSubmit={submit}>
        <h3>{editing == null ? 'Add new' : `Editing #${editing}`}</h3>
        <div className="form-grid">
          {fields.map((f) => (
            <label key={f.key} className={f.type === 'checkbox' ? 'check' : ''}>
              {f.label}
              {f.type === 'select' ? (
                <select value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} required={f.required}>
                  <option value="">–</option>
                  {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'checkbox' ? (
                <input type="checkbox" checked={!!form[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
              ) : f.type === 'textarea' ? (
                <textarea value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === 'image' ? (
                <>
                  <input type="text" placeholder="URL or upload below" value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} required={f.required} />
                  <input type="file" accept={f.key === 'image_url' ? 'image/*,video/*,.mov' : 'image/*,.svg'} onChange={(e) => void upload(f.key, e.target.files?.[0])} />
                </>
              ) : (
                <input type={f.type} step={f.step} value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} required={f.required} />
              )}
            </label>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? 'Uploading…' : editing == null ? 'Add' : 'Save'}</button>
          {editing != null && <button type="button" className="btn" onClick={reset}>Cancel</button>}
          <span className="muted">{msg}</span>
        </div>
      </form>
      <table className="table">
        <tbody>
          {(rows as Row[]).map((row) => (
            <tr key={row.id as number}>
              {columns(row).map((c, i) => <td key={i}>{c}</td>)}
              <td className="num nowrap">
                <button className="link" onClick={() => { setEditing(row.id as number); setForm(row); window.scrollTo(0, 0) }}>Edit</button>{' · '}
                <button className="link danger" onClick={() => void remove(row.id as number)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Line { driver_id: string; kart: string; best: string; avg: string; laps: string; speed: string; dnf: boolean }
const blank = (): Line => ({ driver_id: '', kart: '', best: '', avg: '', laps: '', speed: '', dnf: false })

function HeatEditor({ raceId, heat }: { raceId: number; heat: Heat }) {
  const { data, reload } = useData()
  const existing = data.results.filter((r) => r.heat_id === heat.id)
  const init = () => {
    const lines: Line[] = existing.sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).map((r) => ({
      driver_id: String(r.driver_id), kart: r.kart_number?.toString() ?? '', best: r.best_lap_time_ms ? formatTime(r.best_lap_time_ms) : '',
      avg: r.average_lap_time_ms ? formatTime(r.average_lap_time_ms) : '', laps: r.laps_completed?.toString() ?? '', speed: r.average_speed?.toString() ?? '', dnf: r.dnf,
    }))
    while (lines.length < 5) lines.push(blank())
    return lines
  }
  const [lines, setLines] = useState<Line[]>(init)
  const [msg, setMsg] = useState('')
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  async function save() {
    const filled = lines.filter((l) => l.driver_id)
    if (new Set(filled.map((l) => l.driver_id)).size !== filled.length) return setMsg('A driver appears twice in this heat')
    const parsed = filled.map((l) => ({ l, best: parseTime(l.best), avg: parseTime(l.avg) }))
    if (parsed.some((p) => p.l.best.trim() && p.best == null)) return setMsg('Invalid lap time – use e.g. 41.928 or 1:02.345')
    const order = [...parsed].sort((a, b) => Number(a.l.dnf || a.best == null) - Number(b.l.dnf || b.best == null) || (a.best ?? 0) - (b.best ?? 0))
    const rows = order.map((p, i) => ({
      race_id: raceId, heat_id: heat.id, driver_id: Number(p.l.driver_id), position: p.l.dnf ? null : i + 1,
      best_lap_time_ms: p.best, average_lap_time_ms: p.avg, laps_completed: p.l.laps ? Number(p.l.laps) : null,
      average_speed: p.l.speed ? Number(p.l.speed.replace(',', '.')) : null, kart_number: p.l.kart ? Number(p.l.kart) : null, dnf: p.l.dnf,
    }))
    const del = await supabase.from('race_results').delete().eq('heat_id', heat.id)
    if (del.error) return setMsg(del.error.message)
    if (rows.length) {
      const ins = await supabase.from('race_results').insert(rows)
      if (ins.error) return setMsg(ins.error.message)
    }
    setMsg('Saved ✓ (positions calculated from best lap)')
    await reload()
  }

  async function removeHeat() {
    if (!confirm(`Delete heat ${heat.heat_number} and all its results?`)) return
    await supabase.from('race_results').delete().eq('heat_id', heat.id)
    await supabase.from('heats').delete().eq('id', heat.id)
    await reload()
  }

  return (
    <div className="card admin-form">
      <div className="section-title"><h3>Heat {heat.heat_number}{heat.name ? ` – ${heat.name}` : ''}</h3><button className="link danger" onClick={() => void removeHeat()}>Delete heat</button></div>
      <div className="result-lines">
        <div className="result-line head"><span>Driver</span><span>Kart</span><span>Best lap</span><span>Avg lap</span><span>Laps</span><span>Avg km/h</span><span>DNF</span></div>
        {lines.map((l, i) => (
          <div className="result-line" key={i}>
            <select value={l.driver_id} onChange={(e) => upd(i, { driver_id: e.target.value })}>
              <option value="">–</option>
              {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input value={l.kart} inputMode="numeric" onChange={(e) => upd(i, { kart: e.target.value })} />
            <input value={l.best} placeholder="41.928" onChange={(e) => upd(i, { best: e.target.value })} />
            <input value={l.avg} placeholder="43.100" onChange={(e) => upd(i, { avg: e.target.value })} />
            <input value={l.laps} inputMode="numeric" onChange={(e) => upd(i, { laps: e.target.value })} />
            <input value={l.speed} inputMode="decimal" onChange={(e) => upd(i, { speed: e.target.value })} />
            <input type="checkbox" checked={l.dnf} onChange={(e) => upd(i, { dnf: e.target.checked })} />
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => setLines((ls) => [...ls, blank()])}>+ Row</button>
        <button className="btn primary" onClick={() => void save()}>Save heat</button>
        <span className="muted">{msg}</span>
      </div>
    </div>
  )
}

function Results() {
  const { data, reload } = useData()
  const races = [...data.races].sort((a, b) => (a.race_date < b.race_date ? 1 : -1))
  const [raceId, setRaceId] = useState<number | ''>('')
  const current = raceId || races[0]?.id
  const heats = data.heats.filter((h) => h.race_id === current).sort((a, b) => a.heat_number - b.heat_number)

  async function addHeat() {
    const n = (heats.at(-1)?.heat_number ?? 0) + 1
    await supabase.from('heats').insert({ race_id: current, heat_number: n, name: null })
    await reload()
  }
  async function addAllHeats() {
    const rows = [1, 2, 3, 4].filter((n) => !heats.some((h) => h.heat_number === n)).map((n) => ({ race_id: current, heat_number: n, name: null }))
    if (rows.length) await supabase.from('heats').insert(rows)
    await reload()
  }

  if (!races.length) return <p className="muted">Create a race first.</p>
  return (
    <div>
      <label>Race
        <select value={current} onChange={(e) => setRaceId(Number(e.target.value))}>
          {races.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.race_date})</option>)}
        </select>
      </label>
      <p className="muted">Group 1 drives heats 1 and 3, group 2 drives heats 2 and 4. Enter times like 41.928 or 1:02.345.</p>
      <div className="row">
        <button className="btn" onClick={() => void addAllHeats()}>Create heats 1–4</button>
        <button className="btn" onClick={() => void addHeat()}>+ Heat</button>
      </div>
      {heats.map((h) => <HeatEditor key={`${h.id}-${data.results.filter((r) => r.heat_id === h.id).length}`} raceId={current!} heat={h} />)}
    </div>
  )
}

function PhotoOrder() {
  const { data, reload } = useData()
  const races = data.races.filter((r) => data.photos.some((p) => p.race_id === r.id))
  const [raceId, setRaceId] = useState<number | ''>('')
  const current = raceId || races[0]?.id
  const list = data.photos.filter((p) => p.race_id === current)
  if (!races.length) return null

  async function move(i: number, dir: -1 | 1) {
    const ids = list.map((p) => p.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await Promise.all(ids.map((id, n) => supabase.from('race_photos').update({ sort_order: n }).eq('id', id)))
    await reload()
  }

  return (
    <div className="card admin-form">
      <h3>Order</h3>
      <label>Race
        <select value={current} onChange={(e) => setRaceId(Number(e.target.value))}>
          {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <ul className="plain order-list">
        {list.map((p, i) => (
          <li key={p.id}>
            {isVideo(p.image_url) ? <video src={p.image_url} preload="metadata" muted /> : <img src={p.image_url} alt="" />}
            <span className="grow">{p.caption || <em className="muted">No caption</em>}</span>
            <button className="btn small" disabled={i === 0} onClick={() => void move(i, -1)}>↑</button>
            <button className="btn small" disabled={i === list.length - 1} onClick={() => void move(i, 1)}>↓</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const TABS = ['Results', 'Races', 'Drivers', 'Tracks', 'Crashes', 'Gallery'] as const

function Dashboard({ email }: { email: string | undefined }) {
  const { data } = useData()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Results')
  const trackOpts = data.tracks.map((t) => ({ value: t.id, label: t.name }))
  const raceOpts = data.races.map((r) => ({ value: r.id, label: r.name }))
  const driverOpts = data.drivers.map((d) => ({ value: d.id, label: d.name }))
  const driverName = (id: unknown) => data.drivers.find((d) => d.id === id)?.name ?? '?'
  const raceName = (id: unknown) => data.races.find((r) => r.id === id)?.name ?? '?'

  return (
    <>
      <div className="section-title">
        <h1 className="page-title">Admin</h1>
        <span className="muted">{email} · <button className="link" onClick={() => void supabase.auth.signOut()}>Sign out</button></span>
      </div>
      <div className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>

      {tab === 'Results' && <Results />}
      {tab === 'Races' && (
        <Crud table="races" rows={[...data.races].sort((a, b) => (a.race_date < b.race_date ? 1 : -1))} columns={(r) => [String(r.name), String(r.race_date), data.tracks.find((t) => t.id === r.track_id)?.name ?? '?']}
          fields={[
            { key: 'name', label: 'Name (e.g. Race #07 – Trondheim Karting)', type: 'text', required: true },
            { key: 'track_id', label: 'Track', type: 'select', options: trackOpts, required: true },
            { key: 'race_date', label: 'Date', type: 'date', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
          ]} />
      )}
      {tab === 'Drivers' && (
        <Crud table="drivers" rows={data.drivers} defaults={{ is_active: true }} columns={(r) => [String(r.name), String(r.nickname ?? ''), r.is_active ? 'Active' : 'Inactive']}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'nickname', label: 'Nickname', type: 'text' },
            { key: 'photo_url', label: 'Profile photo', type: 'image' },
            { key: 'is_active', label: 'Active', type: 'checkbox' },
          ]} />
      )}
      {tab === 'Tracks' && (
        <Crud table="tracks" rows={data.tracks} columns={(r) => [String(r.name), String(r.location ?? ''), r.svg_url ? 'Has map' : 'No map']}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'location', label: 'Location', type: 'text' },
            { key: 'svg_url', label: 'Track map (SVG)', type: 'image' },
          ]} />
      )}
      {tab === 'Crashes' && (
        <>
          <p className="muted">x / y are percentages (0–100) of the track map, measured from the top-left corner.</p>
          <Crud table="crashes" rows={data.crashes} columns={(r) => [raceName(r.race_id), driverName(r.driver_id), String(r.turn_name ?? ''), r.lap_number ? `Lap ${r.lap_number}` : '']}
            fields={[
              { key: 'race_id', label: 'Race', type: 'select', options: raceOpts, required: true },
              { key: 'driver_id', label: 'Driver', type: 'select', options: driverOpts, required: true },
              { key: 'lap_number', label: 'Lap', type: 'number' },
              { key: 'turn_name', label: 'Turn', type: 'text' },
              { key: 'x', label: 'x (%)', type: 'number', step: 'any', required: true },
              { key: 'y', label: 'y (%)', type: 'number', step: 'any', required: true },
              { key: 'description', label: 'Description', type: 'textarea' },
            ]} />
        </>
      )}
      {tab === 'Gallery' && (
        <>
        <PhotoOrder />
        <Crud table="race_photos" rows={data.photos} columns={(r) => [raceName(r.race_id), String(r.caption ?? '')]}
          fields={[
            { key: 'race_id', label: 'Race', type: 'select', options: raceOpts, required: true },
            { key: 'image_url', label: 'Photo or video', type: 'image', required: true },
            { key: 'caption', label: 'Caption', type: 'text' },
          ]} />
        </>
      )}
    </>
  )
}

export default function Admin() {
  const { session, isAdmin, ready } = useAdmin()
  if (!ready) return <p className="muted">Loading…</p>
  if (!session) return <Login />
  if (isAdmin === null) return <p className="muted">Checking access…</p>
  if (!isAdmin) return <div className="card"><p className="error">This account is not an admin.</p><button className="btn" onClick={() => void supabase.auth.signOut()}>Sign out</button></div>
  return <Dashboard email={session.user.email} />
}

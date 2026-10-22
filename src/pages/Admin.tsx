import { Fragment, useEffect, useState } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, uploadImage } from '../lib/supabase'
import { useData } from '../lib/DataContext'
import { Avatar, CrashPin } from '../components/Shared'
import { formatTime, isVideo, parseTime } from '../lib/format'
import { heatStanding } from '../lib/stats'
import { scanSheet } from '../lib/scan'
import type { Heat, Photo } from '../lib/types'

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
function Crud({ table, fields, rows, columns, defaults = {}, thumb, extra, groupBy, multiUpload }: {
  table: string
  /** Lets "Add new" pick several files at once and creates one row per file. */
  multiUpload?: boolean
  fields: Field[]
  rows: object[]
  columns: (row: Row) => string[]
  defaults?: Row
  thumb?: (row: Row) => string | null
  extra?: (row: Row) => ReactNode
  groupBy?: (row: Row) => string
}) {
  const { reload } = useData()
  const [form, setForm] = useState<Row>(defaults)
  const [editing, setEditing] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  /** Bumped to clear the multi-file input after a successful upload. */
  const [round, setRound] = useState(0)
  const multi = !!multiUpload && editing == null

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }))
  const reset = () => { setForm(defaults); setEditing(null); setFiles([]); setRound((n) => n + 1) }

  async function submitMany(payload: Row) {
    setBusy(true)
    let done = 0
    try {
      // Sequential so the items are added in the order they were selected.
      for (const file of files) {
        setMsg(`Uploading ${done + 1} of ${files.length}…`)
        const image_url = await uploadImage(file, table)
        const { error } = await supabase.from(table).insert({ ...payload, image_url })
        if (error) throw error
        done++
      }
      setMsg(`Added ${done} item${done === 1 ? '' : 's'} ✓`)
      reset()
    } catch (err) {
      setMsg(`${(err as Error).message} (${done} of ${files.length} added)`)
    }
    setBusy(false)
    await reload()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const payload: Row = {}
    for (const f of fields) {
      const v = form[f.key]
      if (f.type === 'checkbox') payload[f.key] = !!v
      else if (v === '' || v == null) payload[f.key] = null
      else payload[f.key] = f.type === 'number' || f.type === 'select' ? Number(v) : v
    }
    if (multi) return submitMany(payload)
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
              ) : f.type === 'image' && multi ? (
                <input key={round} type="file" multiple accept="image/*,video/*,.mov" onChange={(e) => setFiles([...(e.target.files ?? [])])} required />
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
          <button className="btn primary" disabled={busy}>{busy ? 'Uploading…' : editing != null ? 'Save' : multi && files.length > 1 ? `Add ${files.length}` : 'Add'}</button>
          {editing != null && <button type="button" className="btn" onClick={reset}>Cancel</button>}
          <span className="muted">{msg}</span>
        </div>
      </form>
      <table className="table">
        <tbody>
          {(rows as Row[]).map((row, idx, all) => (
            <Fragment key={row.id as number}>
            {groupBy && (idx === 0 || groupBy(all[idx - 1]) !== groupBy(row)) && (
              <tr className="group-row"><th colSpan={99}>{groupBy(row)}</th></tr>
            )}
            <tr>
              {thumb && <td className="thumb-cell">{thumb(row) ? (isVideo(thumb(row)!) ? <video src={thumb(row)!} preload="metadata" muted /> : <img src={thumb(row)!} alt="" />) : null}</td>}
              {columns(row).map((c, i) => <td key={i}>{c}</td>)}
              <td className="num nowrap">
                {extra?.(row)}{extra ? " · " : null}
                <button className="link" onClick={() => { setEditing(row.id as number); setForm(row); window.scrollTo(0, 0) }}>Edit</button>{' · '}
                <button className="link danger" onClick={() => void remove(row.id as number)}>Delete</button>
              </td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Line { driver_id: string; kart: string; best: string; speed: string; topSpeed: string; dnf: boolean }
const blank = (): Line => ({ driver_id: '', kart: '', best: '', speed: '', topSpeed: '', dnf: false })
const isBlank = (l: Line) => !l.driver_id && !l.kart && !l.best && !l.speed && !l.topSpeed && !l.dnf

function HeatEditor({ raceId, heat }: { raceId: number; heat: Heat }) {
  const { data, reload } = useData()
  const existing = data.results.filter((r) => r.heat_id === heat.id)
  const init = () => {
    const lines: Line[] = heatStanding(existing).map(({ result: r }) => r).map((r) => ({
      driver_id: String(r.driver_id), kart: r.kart_number?.toString() ?? '', best: r.best_lap_time_ms ? formatTime(r.best_lap_time_ms) : '',
      speed: r.average_speed?.toString() ?? '', topSpeed: r.top_average_speed?.toString() ?? '', dnf: r.dnf,
    }))
    while (lines.length < 5) lines.push(blank())
    return lines
  }
  const [lines, setLines] = useState<Line[]>(init)
  const [msg, setMsg] = useState('')
  const [scanning, setScanning] = useState(false)
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  /** Reads timing sheet photos in the browser (nothing is uploaded) and adds one row per sheet. The driver is not on the sheet. */
  async function scan(files: File[]) {
    setScanning(true)
    const karts = new Set(lines.map((l) => l.kart).filter(Boolean))
    const problems: string[] = []
    let done = 0
    let read = 0
    for (const file of files) {
      setMsg(files.length > 1 ? `Reading sheet ${done + 1} of ${files.length}…` : 'Reading sheet…')
      const name = files.length > 1 ? `${file.name}: ` : ''
      try {
        const s = await scanSheet(file)
        read++
        const line: Line = { ...blank(), kart: s.kart?.toString() ?? '', best: s.best ? formatTime(s.best) : '', speed: s.speed?.toString() ?? '', topSpeed: s.topSpeed?.toString() ?? '' }
        setLines((ls) => { const i = ls.findIndex(isBlank); return i < 0 ? [...ls, line] : ls.map((l, j) => (j === i ? line : l)) })
        const missing = ([['kart', s.kart], ['best lap', s.best], ['avg speed', s.speed], ['top speed', s.topSpeed]] as const).filter(([, v]) => v == null).map(([label]) => label)
        if (missing.length) problems.push(`${name}could not read ${missing.join(', ')}`)
        if (line.kart && karts.has(line.kart)) problems.push(`${name}kart ${line.kart} is already in this heat`)
        karts.add(line.kart)
        problems.push(...s.warnings.map((w) => name + w))
      } catch (err) {
        problems.push(name + (err as Error).message.replace(/\.$/, ''))
      }
      done++
    }
    const summary = read ? `${read} sheet${read === 1 ? '' : 's'} read – choose the driver and check the values.` : 'No sheets read.'
    setMsg(problems.length ? `${summary} ${problems.join('; ')}.` : summary)
    setScanning(false)
  }

  async function save() {
    const filled = lines.filter((l) => l.driver_id)
    if (new Set(filled.map((l) => l.driver_id)).size !== filled.length) return setMsg('A driver appears twice in this heat')
    const parsed = filled.map((l) => ({ l, best: parseTime(l.best) }))
    if (parsed.some((p) => p.l.best.trim() && p.best == null)) return setMsg('Invalid lap time – use e.g. 41.928 or 1:02.345')
    const order = [...parsed].sort((a, b) => Number(a.l.dnf || a.best == null) - Number(b.l.dnf || b.best == null) || (a.best ?? 0) - (b.best ?? 0))
    const rows = order.map((p) => ({
      race_id: raceId, heat_id: heat.id, driver_id: Number(p.l.driver_id),
      best_lap_time_ms: p.best,
      average_speed: p.l.speed ? Number(p.l.speed.replace(',', '.')) : null,
      top_average_speed: p.l.topSpeed ? Number(p.l.topSpeed.replace(',', '.')) : null, kart_number: p.l.kart ? Number(p.l.kart) : null, dnf: p.l.dnf,
    }))
    const del = await supabase.from('race_results').delete().eq('heat_id', heat.id)
    if (del.error) return setMsg(del.error.message)
    if (rows.length) {
      const ins = await supabase.from('race_results').insert(rows)
      if (ins.error) return setMsg(ins.error.message)
    }
    setMsg('Saved ✓')
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
        <div className="result-line head"><span>Driver</span><span>Kart</span><span>Best lap</span><span>Avg km/h</span><span>Top avg km/h</span><span>DNF</span></div>
        {lines.map((l, i) => (
          <div className="result-line" key={i}>
            <select value={l.driver_id} onChange={(e) => upd(i, { driver_id: e.target.value })}>
              <option value="">–</option>
              {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input value={l.kart} inputMode="numeric" onChange={(e) => upd(i, { kart: e.target.value })} />
            <input value={l.best} placeholder="41.928" onChange={(e) => upd(i, { best: e.target.value })} />
            <input value={l.speed} inputMode="decimal" onChange={(e) => upd(i, { speed: e.target.value })} />
            <input value={l.topSpeed} inputMode="decimal" onChange={(e) => upd(i, { topSpeed: e.target.value })} />
            <input type="checkbox" checked={l.dnf} onChange={(e) => upd(i, { dnf: e.target.checked })} />
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => setLines((ls) => [...ls, blank()])}>+ Row</button>
        <label className="btn">
          {scanning ? 'Reading…' : 'Scan sheet'}
          <input type="file" accept="image/*" multiple hidden disabled={scanning} onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void scan(files) }} />
        </label>
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
      <div className="row">
        <button className="btn" onClick={() => void addAllHeats()}>Create heats 1–4</button>
        <button className="btn" onClick={() => void addHeat()}>+ Heat</button>
      </div>
      {heats.map((h) => <HeatEditor key={`${h.id}-${data.results.filter((r) => r.heat_id === h.id).length}`} raceId={current!} heat={h} />)}
    </div>
  )
}

async function movePhoto(photos: Photo[], id: number, dir: -1 | 1, reload: () => Promise<void>) {
  const photo = photos.find((p) => p.id === id)
  const ids = photos.filter((p) => p.race_id === photo?.race_id).map((p) => p.id)
  const i = ids.indexOf(id)
  const j = i + dir
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  const results = await Promise.all(ids.map((pid, n) => supabase.from('race_photos').update({ sort_order: n }).eq('id', pid)))
  const failed = results.find((r) => r.error)
  if (failed?.error) alert(`Could not change order: ${failed.error.message}\n\nHave you run supabase/gallery-order.sql?`)
  await reload()
}

function CrashEditor() {
  const { data, reload } = useData()
  const races = [...data.races].sort((a, b) => (a.race_date < b.race_date ? 1 : -1))
  const [raceId, setRaceId] = useState<number | ''>('')
  const [driverId, setDriverId] = useState<number | ''>('')
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const current = raceId || races[0]?.id
  const race = data.races.find((r) => r.id === current)
  const track = data.tracks.find((t) => t.id === race?.track_id)
  const crashes = data.crashes.filter((c) => c.race_id === current)
  const driver = data.drivers.find((d) => d.id === driverId)

  const reset = () => { setDriverId(''); setPoint(null); setDescription(''); setEditing(null) }

  function place(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (v: number, size: number) => Math.min(100, Math.max(0, Math.round((v / size) * 1000) / 10))
    setPoint({ x: pct(e.clientX - rect.left, rect.width), y: pct(e.clientY - rect.top, rect.height) })
  }

  async function save() {
    if (!driverId) return setMsg('Choose a driver first')
    if (!point) return setMsg('Click on the map to place the crash')
    const payload = { race_id: current, driver_id: driverId, x: point.x, y: point.y, description: description.trim() || null }
    const { error } = editing == null
      ? await supabase.from('crashes').insert(payload)
      : await supabase.from('crashes').update(payload).eq('id', editing)
    if (error) return setMsg(error.message)
    setMsg('Saved ✓')
    reset()
    await reload()
  }

  async function remove(id: number) {
    if (!confirm('Delete this crash?')) return
    const { error } = await supabase.from('crashes').delete().eq('id', id)
    if (error) return setMsg(error.message)
    if (editing === id) reset()
    await reload()
  }

  if (!races.length) return <p className="muted">Create a race first.</p>
  return (
    <div>
      <label>Race
        <select value={current} onChange={(e) => { setRaceId(Number(e.target.value)); reset() }}>
          {races.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.race_date})</option>)}
        </select>
      </label>
      {!track?.svg_url ? (
        <p className="muted">There is no map for {track?.name ?? 'this track'} yet. Add an SVG under the Tracks tab first.</p>
      ) : (
        <div className="card admin-form">
          <h3>{editing == null ? 'Add crash' : 'Editing crash'}</h3>
          <div className="form-grid">
            <label>Driver
              <select value={driverId} onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">–</option>
                {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>Description (optional)
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <p className="muted">{driverId ? 'Click on the map where the crash happened.' : 'Choose a driver, then click on the map.'}</p>
          <div className="map-wrap pick" onClick={place}>
            <img src={track.svg_url} alt={`Map of ${track.name}`} draggable={false} />
            {crashes.filter((c) => c.id !== editing).map((c) => (
              <CrashPin key={c.id} driver={data.drivers.find((d) => d.id === c.driver_id)} x={c.x} y={c.y} dim />
            ))}
            {point && <CrashPin driver={driver} x={point.x} y={point.y} active />}
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => void save()}>{editing == null ? 'Add crash' : 'Save'}</button>
            {(editing != null || point || driverId) && <button className="btn" onClick={reset}>Cancel</button>}
            <span className="muted">{msg}</span>
          </div>
        </div>
      )}
      <ul className="plain">
        {crashes.map((c) => {
          const d = data.drivers.find((x) => x.id === c.driver_id)
          return (
            <li key={c.id} className="crash-row">
              <Avatar driver={d} size={32} />
              <span className="grow">{d?.name}{c.description ? <span className="muted"> – {c.description}</span> : null}</span>
              <button className="link" onClick={() => { setEditing(c.id); setDriverId(c.driver_id); setPoint({ x: c.x, y: c.y }); setDescription(c.description ?? ''); window.scrollTo(0, 0) }}>Edit</button>{' · '}
              <button className="link danger" onClick={() => void remove(c.id)}>Delete</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const TABS = ['Results', 'Races', 'Drivers', 'Tracks', 'Crashes', 'Gallery'] as const

function Dashboard({ email }: { email: string | undefined }) {
  const { data, reload } = useData()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Results')
  const trackOpts = data.tracks.map((t) => ({ value: t.id, label: t.name }))
  const raceOpts = data.races.map((r) => ({ value: r.id, label: r.name }))
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
        <Crud table="drivers" rows={data.drivers} defaults={{ is_active: true }} columns={(r) => [String(r.name), r.is_active ? 'Active' : 'Inactive']}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
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
      {tab === 'Crashes' && <CrashEditor />}
      {tab === 'Gallery' && (
        <>
        <Crud table="race_photos" multiUpload rows={[...data.photos].sort((a, b) => a.race_id - b.race_id)} thumb={(r) => String(r.image_url)}
          extra={(r) => <><button className="btn small" onClick={() => void movePhoto(data.photos, r.id as number, -1, reload)}>↑</button> <button className="btn small" onClick={() => void movePhoto(data.photos, r.id as number, 1, reload)}>↓</button></>}
          groupBy={(r) => raceName(r.race_id)} columns={(r) => [String(r.caption || "")]}
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

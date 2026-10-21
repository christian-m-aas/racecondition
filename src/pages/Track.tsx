import { useEffect, useRef, useState } from 'react'
import { useData } from '../lib/DataContext'
import { formatTime } from '../lib/format'
import { CrashPin, Loading } from '../components/Shared'

type View = { s: number; tx: number; ty: number }
const FIT: View = { s: 1, tx: 0, ty: 0 }
const MAX_ZOOM = 6
const CRASH_ZOOM = 2.5
// Pins are scaled by zoom^-(1 - PIN_GROWTH) inside the zoomed map, so on screen they grow as zoom^PIN_GROWTH.
const PIN_GROWTH = 0.25
const MOBILE_QUERY = '(max-width: 640px)'

// Keeps the zoomed map covering the whole viewport (no empty edges).
function clampView(v: View, w: number, h: number): View {
  const s = Math.min(Math.max(v.s, 1), MAX_ZOOM)
  return { s, tx: Math.min(0, Math.max(w - w * s, v.tx)), ty: Math.min(0, Math.max(h - h * s, v.ty)) }
}

function useMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

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

  // Mobile map: pinch to zoom, drag to pan, and selecting a crash centres it.
  const mobile = useMobile()
  const clipRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const last = useRef<{ d: number; mx: number; my: number } | null>(null)
  const start = useRef({ x: 0, y: 0 })
  const moved = useRef(false)
  const [view, setView] = useState<View>(FIT)
  const [smooth, setSmooth] = useState(false)

  const resetView = () => { setSmooth(true); setView(FIT) }

  // Rotated layout: the map's width (dims.ch) runs down the screen, its height (dims.cw) across.
  const imgRef = useRef<HTMLImageElement>(null)
  const [dims, setDims] = useState({ cw: 0, ch: 0 })
  const rotated = mobile && dims.cw > 0 && dims.ch > 0

  useEffect(() => {
    const clip = clipRef.current, img = imgRef.current
    if (!mobile || !clip || !img) return
    const measure = () => {
      const cw = clip.clientWidth, ch = img.offsetWidth
      setDims((d) => (d.cw === cw && d.ch === ch ? d : { cw, ch }))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(clip)
    ro.observe(img)
    return () => ro.disconnect()
  }, [mobile, track?.svg_url])

  const selectCrash = (c: { id: number; x: number; y: number }) => {
    setCrashId(c.id)
    if (!rotated) return
    const { cw: w, ch: h } = dims
    const px = w * (1 - c.y / 100), py = h * (c.x / 100)
    setSmooth(true)
    setView(clampView({ s: CRASH_ZOOM, tx: w / 2 - CRASH_ZOOM * px, ty: h / 2 - CRASH_ZOOM * py }, w, h))
  }

  const gesture = () => {
    const pts = [...pointers.current.values()]
    if (!pts.length) return null
    const mx = pts.reduce((n, p) => n + p.x, 0) / pts.length
    const my = pts.reduce((n, p) => n + p.y, 0) / pts.length
    return { mx, my, d: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 }
  }
  const local = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setSmooth(false)
    const p = local(e)
    if (!pointers.current.size) { moved.current = false; start.current = p }
    else moved.current = true
    pointers.current.set(e.pointerId, p)
    last.current = gesture()
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    if (Math.hypot(p.x - start.current.x, p.y - start.current.y) > 6) moved.current = true
    const g = gesture(), prev = last.current
    last.current = g
    if (!g || !prev) return
    const w = e.currentTarget.clientWidth, h = e.currentTarget.clientHeight
    setView((v) => {
      const s = g.d > 0 && prev.d > 0 ? Math.min(Math.max(v.s * (g.d / prev.d), 1), MAX_ZOOM) : v.s
      // Keep the map point under the fingers' midpoint under the fingers' new midpoint.
      return clampView({ s, tx: g.mx - ((prev.mx - v.tx) / v.s) * s, ty: g.my - ((prev.my - v.ty) / v.s) * s }, w, h)
    })
  }
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    last.current = gesture()
  }

  return (
    <>
      <h1 className="page-title">Track</h1>
      <Loading />
      {data.tracks.length > 1 && (
        <select value={track?.id} onChange={(e) => { setTrackId(Number(e.target.value)); setCrashId(null); resetView() }}>
          {data.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {track && (
        <div className="grid two track-grid">
          <div className="card trackmap">
            {track.svg_url ? (
              <div
                ref={clipRef}
                className={`map-clip ${view.s > 1 ? 'zoomed' : ''}`}
                style={rotated ? { height: dims.ch } : undefined}
                onPointerDown={mobile ? onPointerDown : undefined}
                onPointerMove={mobile ? onPointerMove : undefined}
                onPointerUp={mobile ? onPointerEnd : undefined}
                onPointerCancel={mobile ? onPointerEnd : undefined}
                onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault() } }}
              >
              <div
                className={`map-wrap ${smooth ? 'smooth' : ''}`}
                style={mobile ? ({ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, '--inv': Math.pow(view.s, PIN_GROWTH - 1) } as React.CSSProperties) : undefined}
              >
                {/* On mobile the map is rotated 90° clockwise so its long side runs down the screen. */}
                <div className="map-rot" style={rotated ? { width: dims.ch, height: dims.cw, transform: `translateX(${dims.cw}px) rotate(90deg)` } : undefined}>
                  <img ref={imgRef} src={track.svg_url} alt={`Map of ${track.name}`} style={mobile && dims.cw ? { height: dims.cw } : undefined} />
                  {/* Crash pins use x/y as percentages (0–100) of the map. */}
                  {crashes.map((c) => (
                    <CrashPin key={c.id} driver={data.drivers.find((d) => d.id === c.driver_id)} x={c.x} y={c.y} active={c.id === crashId} onClick={() => selectCrash(c)} />
                  ))}
                </div>
              </div>
              {mobile && view.s > 1 && <button type="button" className="btn zoom-reset" onClick={resetView}>Zoom out</button>}
              </div>
            ) : (
              <div className="map-placeholder">Track map coming soon 🏎️</div>
            )}
          </div>
          <div>
            <h2>{track.name}</h2>
            {record && <p>Track record: <strong className="mono">{formatTime(record.ms)}</strong> – {data.drivers.find((d) => d.id === record.driverId)?.name}</p>}
            <h3>Crashes ({crashes.length})</h3>
            {selected && (
              <div className="card">
                <strong>{data.drivers.find((d) => d.id === selected.driver_id)?.name}</strong>
                <div className="muted">{data.races.find((r) => r.id === selected.race_id)?.name}</div>
                {selected.description && <p>{selected.description}</p>}
              </div>
            )}
            <ul className="plain">
              {crashes.map((c) => (
                <li key={c.id}><button className="link" onClick={() => selectCrash(c)}>{data.drivers.find((d) => d.id === c.driver_id)?.name}</button></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

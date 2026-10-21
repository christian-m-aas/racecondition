import type { Page, Worker } from 'tesseract.js'

/** What could be read from a lap-timing sheet. null = not found, fill it in by hand. */
export interface SheetScan {
  kart: number | null
  /** Best lap in ms. */
  best: number | null
  /** Average speed in km/h. */
  speed: number | null
  /** Top average speed in km/h. */
  topSpeed: number | null
  warnings: string[]
}

type Fields = Omit<SheetScan, 'warnings'>

// OCR drops colons and swaps "." for " " now and then, so the patterns are forgiving.
const TIME = String.raw`(\d)\s*[:;]?\s*(\d{2})\s*[.,]\s*(\d{3})`
// The whole "km/h" is required, so a half-read "45 km (28" stays empty instead of becoming a wrong 45.
const SPEED = String.raw`\W{0,3}(\d{1,3})(?:\s*[.,:]\s*|\s)?(\d)?\s*km\s*\S?\s*h`
const toMs = (m: RegExpMatchArray, i: number) => (Number(m[i]) * 60 + Number(m[i + 1])) * 1000 + Number(m[i + 2])

/**
 * Pulls kart number, best lap and speeds out of the OCR text. The sheet has a fixed layout
 * ("Best laptime: 0:18.830 on LAP23", "Average speed: 42km/h (26.1mph)", ...), so each value is
 * found through its label. The "Classification by Best Laptime" row for the kart is the fallback.
 */
export function parseSheet(text: string): Fields {
  let kart = Number(text.match(/driver\W*kart\s*(\d+)/i)?.[1]) || null
  let best: number | null = null

  const bestMatch = text.match(new RegExp(String.raw`best\s*lap\s*time\W*${TIME}`, 'i'))
  if (bestMatch) best = toMs(bestMatch, 1)

  const kt = text.match(/kart\s*no\W*(\d{1,3})/i)?.[1]
  const row = kt && text.match(new RegExp(String.raw`\b${kt}\s+kart\s*(\d+)\D{0,8}?\d{1,2}\D{0,8}?${TIME}`, 'i'))
  if (row) {
    kart ??= Number(row[1])
    best ??= toMs(row, 2)
  }

  const found = [...text.matchAll(new RegExp(String.raw`(top\s*)?average\s*speed${SPEED}`, 'gi'))]
    .map((m) => ({ top: !!m[1], v: Number(`${m[2]}.${m[3] ?? 0}`) }))
  let topSpeed = found.find((f) => f.top)?.v ?? null
  let speed = found.find((f) => !f.top)?.v ?? null
  // "Top" got garbled: the top average speed is always the higher of the two.
  if (topSpeed == null && found.length > 1) [speed, topSpeed] = [Math.min(...found.map((f) => f.v)), Math.max(...found.map((f) => f.v))]

  const sane = (v: number | null, min: number, max: number) => (v != null && v >= min && v <= max ? v : null)
  return { kart: sane(kart, 1, 999), best: sane(best, 5000, 600000), speed: sane(speed, 5, 150), topSpeed: sane(topSpeed, 5, 150) }
}

const merge = (a: Fields, b: Fields): Fields => ({
  kart: a.kart ?? b.kart, best: a.best ?? b.best, speed: a.speed ?? b.speed, topSpeed: a.topSpeed ?? b.topSpeed,
})
const complete = (f: Fields) => Object.values(f).every((v) => v != null)

/** Largest side the photo is shrunk to: plenty for the print, much faster than a 12 MP photo. */
const MAX_SIDE = 2200

/** Decodes the photo (honouring the phone's rotation) and shrinks it. Nothing is uploaded. */
async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('could not open the image (use a JPEG or PNG)')
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

/** Photo tilt in degrees (positive = clockwise), from the baselines Tesseract found. */
function tiltOf(page: Page): number {
  const angles = (page.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .filter((l) => l.words.length >= 3 && l.bbox.x1 - l.bbox.x0 > 150)
    .map((l) => (Math.atan2(l.baseline.y1 - l.baseline.y0, l.baseline.x1 - l.baseline.x0) * 180) / Math.PI)
    .sort((a, b) => a - b)
  return angles[angles.length >> 1] ?? 0
}

function rotate(src: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const rad = (degrees * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(src.width * cos + src.height * sin)
  canvas.height = Math.ceil(src.width * sin + src.height * cos)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return canvas
}

// Tesseract is only downloaded when someone scans, and the worker is kept for a minute so
// scanning several sheets in a row doesn't reload it.
let worker: Promise<Worker> | null = null
let idle: ReturnType<typeof setTimeout> | undefined

function getWorker() {
  clearTimeout(idle)
  worker ??= import('tesseract.js').then(({ createWorker }) => createWorker('eng')).catch((err) => { worker = null; throw err })
  return worker
}

function releaseSoon() {
  idle = setTimeout(() => { void worker?.then((w) => w.terminate()); worker = null }, 60_000)
}

/**
 * Reads one photo of a sheet. Page segmentation matters here: "single block" keeps each label
 * and its value on one line. The later passes only run for whatever is still missing: first the
 * same mode on a photo straightened by its measured tilt, then the other modes.
 */
export async function scanSheet(file: File): Promise<SheetScan> {
  const original = await toCanvas(file)
  const { PSM } = await import('tesseract.js')
  const w = await getWorker()
  let fields: Fields = { kart: null, best: null, speed: null, topSpeed: null }
  let image = original
  let tilt = 0
  try {
    for (const [pass, mode] of [PSM.SINGLE_BLOCK, PSM.SINGLE_BLOCK, PSM.SINGLE_COLUMN, PSM.AUTO].entries()) {
      if (pass === 1) {
        if (Math.abs(tilt) < 1) continue
        image = rotate(original, -tilt)
      }
      await w.setParameters({ tessedit_pageseg_mode: mode })
      const { data } = await w.recognize(image, {}, { blocks: true })
      if (pass === 0) tilt = tiltOf(data)
      fields = merge(fields, parseSheet(data.text))
      if (complete(fields)) break
    }
  } finally {
    releaseSoon()
  }
  const warnings: string[] = []
  if (fields.speed != null && fields.topSpeed != null && fields.topSpeed < fields.speed) warnings.push('top average speed is lower than average speed')
  return { ...fields, warnings }
}

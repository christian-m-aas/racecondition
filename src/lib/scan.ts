import { FunctionsHttpError } from '@supabase/supabase-js'
import { parseTime } from './format'
import { supabase } from './supabase'

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

/** What the scan-sheet edge function answers: the values as Gemini read them. */
interface Reading {
  kart: number | null
  best: string | null
  speed: number | null
  topSpeed: number | null
}

/** Largest side the photo is shrunk to: plenty for the print, and keeps the upload small. */
const MAX_SIDE = 1600

/** Decodes the photo (honouring the phone's rotation), shrinks it and returns it as base64 JPEG. */
async function toJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('could not open the image (use a JPEG or PNG)')
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
}

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)

/**
 * Reads one photo of a sheet. The photo is sent to the scan-sheet edge function
 * (supabase/functions/scan-sheet), which lets Gemini read it; only admins may call it.
 */
export async function scanSheet(file: File): Promise<SheetScan> {
  const image = await toJpeg(file)
  const { data, error } = await supabase.functions.invoke<Reading & { error?: string }>('scan-sheet', {
    body: { image, mimeType: 'image/jpeg' },
    // Without a limit a hung request leaves the admin on "Reading sheet…" forever. The function itself
    // gives up on Gemini after 110 s (retries included), so this only catches a function that hangs.
    timeout: 130_000,
  })
  if (error) {
    // Our function answers { error }; anything else (e.g. Supabase cutting it off) is shown as status + text.
    let detail = error.message
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response
      const text = await res.text().catch(() => '')
      let parsed: { error?: string } | null = null
      try { parsed = JSON.parse(text) } catch { /* not JSON */ }
      detail = parsed?.error ?? `${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`
    }
    throw new Error(`could not read the sheet (${detail})`)
  }
  if (!data || data.error) throw new Error(`could not read the sheet (${data?.error ?? 'no answer'})`)

  const kart = num(data.kart, 1, 999)
  const best = num(data.best ? parseTime(data.best) : null, 5000, 600000)
  const speed = num(data.speed, 5, 150)
  const topSpeed = num(data.topSpeed, 5, 150)
  const warnings: string[] = []
  if (speed != null && topSpeed != null && topSpeed < speed) warnings.push('top average speed is lower than average speed')
  return { kart, best, speed, topSpeed, warnings }
}

// Supabase Edge Function: reads a go-kart lap timing sheet photo with Gemini.
// Deployed as "scan-sheet". Needs the secret GEMINI_API_KEY (optional: GEMINI_MODEL).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PROMPT = `This is a photo of a go-kart lap timing sheet for one driver. Read:
- kart: the kart number (e.g. "Driver: Kart 7" or "Kart No 7")
- best: the best lap time exactly as printed, e.g. "0:18.830"
- speed: the "Average speed" in km/h
- topSpeed: the "Top average speed" in km/h
Use null for anything you cannot read with certainty. Never guess.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Only logged-in admins may use the function (and the Gemini quota).
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return json({ error: 'not logged in' }, 401)
  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!admin) return json({ error: 'not an admin' }, 403)

  const { image, mimeType } = await req.json()
  if (!image) return json({ error: 'no image' }, 400)

  // GEMINI_MODEL may list several models, e.g. "gemini-3.8-flash,gemini-3.8-flash-lite": when one is
  // overloaded the next is tried. Busy/overloaded answers are retried, all within Supabase's time limit.
  const models = (Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash').split(',').map((m) => m.trim()).filter(Boolean)
  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType ?? 'image/jpeg', data: image } }] }],
    generationConfig: {
      // Gemini 3 models should keep the default temperature (lower values can make them loop),
      // and reading a few numbers needs little thinking, which keeps it fast.
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          kart: { type: 'INTEGER', nullable: true },
          best: { type: 'STRING', nullable: true },
          speed: { type: 'NUMBER', nullable: true },
          topSpeed: { type: 'NUMBER', nullable: true },
        },
        required: ['kart', 'best', 'speed', 'topSpeed'],
      },
    },
  })
  const deadline = Date.now() + 110_000
  const attempts = models.flatMap((m) => [m, m, m])
  let res: Response | null = null
  let lastError = 'Gemini did not answer'
  const skip = new Set<string>()
  for (const [i, model] of attempts.entries()) {
    if (skip.has(model)) continue
    const left = deadline - Date.now()
    if (left < 5_000) break
    if (i > 0 && attempts[i - 1] === model) await new Promise((r) => setTimeout(r, 2_000 * (i % 3)))
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(Math.min(45_000, left)),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')! },
      body,
    }).catch((err) => err as Error)
    if (r instanceof Error) {
      lastError = r.name === 'TimeoutError' ? `${model} did not answer in time` : `could not reach Gemini: ${r.message}`
      continue
    }
    if (r.ok) { res = r; break }
    lastError = `Gemini ${r.status} (${model}): ${await r.text()}`
    // Busy or overloaded: try again. An unknown model: go on to the next one.
    // Anything else (bad key, bad request) will not get better.
    if (r.status === 404) { skip.add(model); continue }
    if (![429, 500, 503].includes(r.status)) return json({ error: lastError }, 502)
  }
  if (!res) return json({ error: lastError }, 503)

  const out = await res.json()
  const text = (out.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  try {
    return json(JSON.parse(text))
  } catch {
    return json({ error: 'could not read the answer from Gemini' }, 502)
  }
})

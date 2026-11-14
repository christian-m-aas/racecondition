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

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType ?? 'image/jpeg', data: image } }] }],
      generationConfig: {
        temperature: 0,
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
    }),
  })
  if (!res.ok) return json({ error: `Gemini ${res.status}: ${await res.text()}` }, 502)

  const out = await res.json()
  const text = (out.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  try {
    return json(JSON.parse(text))
  } catch {
    return json({ error: 'could not read the answer from Gemini' }, 502)
  }
})

import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
)

export const PHOTO_BUCKET = 'race-photos'

export async function uploadImage(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file)
  if (error) throw error
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}

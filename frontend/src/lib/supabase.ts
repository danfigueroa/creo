import { createClient } from '@supabase/supabase-js'

const supabaseURL = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
let supabaseClient: ReturnType<typeof createClient> | null = null

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const IMAGE_ACCEPTED_MIMES = ['image/jpeg', 'image/png', 'image/webp']

// Backwards-compatible aliases for the avatar upload sites.
export const AVATAR_MAX_BYTES = IMAGE_MAX_BYTES
export const AVATAR_ACCEPTED_MIMES = IMAGE_ACCEPTED_MIMES

export function getSupabaseClient() {
  if (!supabaseURL || !supabaseAnonKey) {
    return null
  }
  if (supabaseClient) {
    return supabaseClient
  }
  supabaseClient = createClient(supabaseURL, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  })
  return supabaseClient
}

export type ImageUploadReason = 'no-client' | 'invalid-type' | 'too-large' | 'upload-failed'

export class ImageUploadError extends Error {
  constructor(public reason: ImageUploadReason, message: string) {
    super(message)
  }
}

// Kept for source compatibility with existing call sites.
export const AvatarUploadError = ImageUploadError

function extensionFor(file: File, fallback = 'jpg'): string {
  const raw = file.name.split('.').pop() || fallback
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned || fallback
}

async function uploadImage(bucket: string, path: string, file: File): Promise<string> {
  const client = getSupabaseClient()
  if (!client) {
    throw new ImageUploadError('no-client', 'Supabase não está configurado.')
  }
  if (!IMAGE_ACCEPTED_MIMES.includes(file.type)) {
    throw new ImageUploadError('invalid-type', 'Use JPG, PNG ou WEBP.')
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new ImageUploadError('too-large', 'A imagem precisa ter até 2 MB.')
  }
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type
  })
  if (error) {
    throw new ImageUploadError('upload-failed', error.message || 'Falha no upload.')
  }
  const { data } = client.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const ext = extensionFor(file)
  return uploadImage('avatars', `${userId}/avatar-${Date.now()}.${ext}`, file)
}

export async function uploadGroupCover(file: File, groupId: string): Promise<string> {
  const ext = extensionFor(file)
  return uploadImage('group-photos', `${groupId}/cover-${Date.now()}.${ext}`, file)
}

export async function uploadAnnouncementImage(file: File, groupId: string): Promise<string> {
  const ext = extensionFor(file)
  const rand = Math.random().toString(36).slice(2, 8)
  return uploadImage('group-photos', `${groupId}/announcements/${Date.now()}-${rand}.${ext}`, file)
}

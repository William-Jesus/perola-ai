import fs from "fs/promises"
import path from "path"

const PROFILES_FILE = process.env.VOICE_PROFILES_PATH || path.join(process.cwd(), "data", "voice-profiles.json")

export interface VoiceProfile {
  id: string
  name: string
  relationship?: string
  toneHint?: string
  instructions?: string
  embedding: number[]
  createdAt: string
}

interface ProfilesData {
  profiles: VoiceProfile[]
  version: number
}

async function readProfiles(): Promise<ProfilesData> {
  try {
    const content = await fs.readFile(PROFILES_FILE, "utf-8")
    return JSON.parse(content)
  } catch {
    return { profiles: [], version: 1 }
  }
}

async function writeProfiles(data: ProfilesData) {
  await fs.mkdir(path.dirname(PROFILES_FILE), { recursive: true })
  await fs.writeFile(PROFILES_FILE, JSON.stringify(data, null, 2), "utf-8")
}

export async function getProfiles(): Promise<VoiceProfile[]> {
  const data = await readProfiles()
  return data.profiles
}

export async function getProfileById(id: string): Promise<VoiceProfile | null> {
  const profiles = await getProfiles()
  return profiles.find((p) => p.id === id) || null
}

export async function saveProfile(profile: VoiceProfile) {
  const data = await readProfiles()
  const idx = data.profiles.findIndex((p) => p.id === profile.id)
  if (idx >= 0) {
    data.profiles[idx] = profile
  } else {
    data.profiles.push(profile)
  }
  await writeProfiles(data)
  return profile
}

export async function deleteProfile(id: string) {
  const data = await readProfiles()
  data.profiles = data.profiles.filter((p) => p.id !== id)
  await writeProfiles(data)
}

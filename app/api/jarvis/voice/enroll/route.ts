import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { saveProfile } from "@/lib/voice-profiles"
import { spawn } from "child_process"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { randomUUID } from "crypto"

async function saveBase64Audio(base64: string, outPath: string) {
  const buf = Buffer.from(base64.replace(/^data:audio\/\w+;base64,/, ""), "base64")
  await fs.writeFile(outPath, buf)
}

async function convertToWav(inputPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", outputPath])
    ffmpeg.on("close", (code) => resolve(code === 0))
  })
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "voice-enroll", 10)
  if (!rl.allowed) return rl.response

  try {
    const { audioBase64, name, relationship, toneHint, instructions } = await request.json()
    if (!audioBase64 || !name) {
      return NextResponse.json({ error: "Missing audio or name" }, { status: 400 })
    }

    const tmpDir = os.tmpdir()
    const id = randomUUID()
    const rawPath = path.join(tmpDir, `${id}.raw`)
    const wavPath = path.join(tmpDir, `${id}.wav`)

    await saveBase64Audio(audioBase64, rawPath)

    // Convert to 16kHz mono WAV if needed
    const converted = await convertToWav(rawPath, wavPath)
    const audioPath = converted ? wavPath : rawPath

    const scriptPath = path.join(process.cwd(), "scripts", "identify-speaker.py")

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn("python3", [scriptPath, "--audio", audioPath, "--enroll", name])
      let stdout = ""
      let stderr = ""
      proc.stdout.on("data", (d) => (stdout += d.toString()))
      proc.stderr.on("data", (d) => (stderr += d.toString()))
      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(stderr || "Python script failed"))
        else resolve(stdout)
      })
    })

    const parsed = JSON.parse(result)
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 500 })
    }

    const profile = await saveProfile({
      id: randomUUID(),
      name,
      relationship: relationship || undefined,
      toneHint: toneHint || undefined,
      instructions: instructions || undefined,
      embedding: parsed.embedding,
      createdAt: new Date().toISOString(),
    })

    // Cleanup
    await fs.unlink(rawPath).catch(() => {})
    await fs.unlink(wavPath).catch(() => {})

    return NextResponse.json({ ok: true, profile: { id: profile.id, name: profile.name } })
  } catch (error) {
    console.error("Voice enroll error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

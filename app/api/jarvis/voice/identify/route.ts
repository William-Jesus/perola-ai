import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildVoiceInstructions, buildInstructionsWithSpeaker } from "@/lib/instructions"
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
  const rl = checkRateLimit(request, "voice-identify", 30)
  if (!rl.allowed) return rl.response

  try {
    const { audioBase64 } = await request.json()
    if (!audioBase64) {
      return NextResponse.json({ error: "Missing audio" }, { status: 400 })
    }

    const tmpDir = os.tmpdir()
    const id = randomUUID()
    const rawPath = path.join(tmpDir, `${id}.raw`)
    const wavPath = path.join(tmpDir, `${id}.wav`)
    const profilesPath = path.join(process.cwd(), "data", "voice-profiles.json")

    await saveBase64Audio(audioBase64, rawPath)

    const converted = await convertToWav(rawPath, wavPath)
    const audioPath = converted ? wavPath : rawPath

    const scriptPath = path.join(process.cwd(), "scripts", "identify-speaker.py")

    const result = await new Promise<string>((resolve, reject) => {
      const args = [scriptPath, "--audio", audioPath, "--profiles", profilesPath]
      const proc = spawn("python3", args)
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

    // If identified, build contextualized instructions
    if (parsed.identified && parsed.speaker) {
      const baseInstructions = buildVoiceInstructions("")
      parsed.suggestedInstructions = buildInstructionsWithSpeaker(baseInstructions, {
        name: parsed.speaker.name,
        relationship: parsed.speaker.relationship,
        toneHint: parsed.speaker.toneHint,
        instructions: parsed.speaker.instructions,
      })
    }

    // Cleanup
    await fs.unlink(rawPath).catch(() => {})
    await fs.unlink(wavPath).catch(() => {})

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Voice identify error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message, identified: false }, { status: 500 })
  }
}

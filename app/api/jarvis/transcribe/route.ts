import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "transcribe", 30)
  if (!rl.allowed) return rl.response

  try {
    const formData = await request.formData()
    const audio = formData.get("audio") as Blob

    if (!audio) {
      return NextResponse.json({ error: "Audio is required" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

    const whisperForm = new FormData()
    whisperForm.append("file", audio, "audio.webm")
    whisperForm.append("model", "whisper-1")
    whisperForm.append("language", "pt")

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Whisper error:", error)
      throw new Error("Whisper transcription failed")
    }

    const data = await response.json()
    return NextResponse.json({ transcript: data.text })
  } catch (error) {
    console.error("Transcribe error:", error)
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 })
  }
}

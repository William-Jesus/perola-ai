import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "mjMw4djkWSDAyI4tdb6b"

async function elevenLabs(text: string, apiKey: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.3, similarity_boost: 0.95, style: 0.5, use_speaker_boost: true },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}`)
  return res.arrayBuffer()
}

async function openaiTTS(text: string, apiKey: string): Promise<ArrayBuffer> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "tts-1", input: text, voice: "onyx", speed: 1.0 }),
  })
  if (!res.ok) throw new Error(`OpenAI TTS error ${res.status}`)
  return res.arrayBuffer()
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "speak", 30)
  if (!rl.allowed) return rl.response

  try {
    const { text } = await request.json()
    if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 })

    let audioBuffer: ArrayBuffer | null = null

    const elevenKey = process.env.ELEVENLABS_API_KEY
    if (elevenKey) {
      try {
        audioBuffer = await elevenLabs(text, elevenKey)
      } catch (e) {
        console.warn("ElevenLabs falhou, usando OpenAI TTS como fallback:", e)
      }
    }

    if (!audioBuffer) {
      const openaiKey = process.env.OPENAI_API_KEY
      if (!openaiKey) return NextResponse.json({ error: "No TTS provider available" }, { status: 500 })
      audioBuffer = await openaiTTS(text, openaiKey)
    }

    return new NextResponse(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": audioBuffer.byteLength.toString() },
    })
  } catch (error) {
    console.error("Speak API error:", error)
    return NextResponse.json({ error: "Failed to generate speech" }, { status: 500 })
  }
}

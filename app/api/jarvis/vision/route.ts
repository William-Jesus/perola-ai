import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "vision", 20)
  if (!rl.allowed) return rl.response

  try {
    const { image } = await request.json()
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Imagem é obrigatória (base64 data URI)" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key não configurada" }, { status: 500 })
    }

    // Validate base64 data URI format
    const base64Match = image.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
    if (!base64Match) {
      return NextResponse.json({ error: "Formato de imagem inválido. Use data:image/jpeg;base64,..." }, { status: 400 })
    }

    const mimeType = `image/${base64Match[1] === "jpg" ? "jpeg" : base64Match[1]}`
    const base64Data = base64Match[2]

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "Você é JARVIS, assistente de IA sofisticado. Descreva o que vê na imagem de forma concisa e direta, em português. Foque no objeto principal e no contexto. Seja objetivo, como se estivesse falando com o usuário. Responda em 1-3 frases curtas.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "O que você vê nesta imagem?" },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.4,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Vision API error:", errorText)
      return NextResponse.json({ error: "Erro na análise de imagem" }, { status: 502 })
    }

    const data = await response.json()
    const description = data.choices?.[0]?.message?.content?.trim() || "Não consegui identificar o que é."

    return NextResponse.json({ description })
  } catch (error) {
    console.error("Vision route error:", error)
    return NextResponse.json({ error: "Falha ao processar imagem" }, { status: 500 })
  }
}

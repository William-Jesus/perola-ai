import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "title", 30)
  if (!rl.allowed) return rl.response

  try {
    const { messages } = await request.json()
    if (!messages || messages.length === 0) {
      return NextResponse.json({ title: "Nova conversa" })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ title: "Nova conversa" })

    const preview = messages
      .slice(0, 4)
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuário" : "Jarvis"}: ${m.content}`)
      .join("\n")

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Gere um título curto (máximo 5 palavras) para esta conversa. Responda APENAS o título, sem pontuação extra.",
          },
          { role: "user", content: preview },
        ],
        max_tokens: 20,
        temperature: 0.5,
      }),
    })

    const data = await response.json()
    const title = data.choices?.[0]?.message?.content?.trim() || "Nova conversa"
    return NextResponse.json({ title })
  } catch {
    return NextResponse.json({ title: "Nova conversa" })
  }
}

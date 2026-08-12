import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

/**
 * Os olhos da Pérola.
 *
 * Separado de /api/jarvis/vision de propósito: lá o prompt é "descreva o que vê
 * em 1 a 3 frases", que serve pro JARVIS mas destrói um exercício de matemática.
 * Aqui a tarefa é TRANSCREVER com fidelidade — e nunca resolver.
 * Quem conduz é a Pérola, com o enunciado em mãos.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(request, "perola-ver", 20)
  if (!rl.allowed) return rl.response

  try {
    const { image } = await request.json()
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "imagem obrigatória (base64 data URI)" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 500 })
    }

    if (!/^data:image\/(png|jpeg|jpg|webp);base64,.+/.test(image)) {
      return NextResponse.json({ error: "formato inválido" }, { status: 400 })
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Você são os olhos de uma robozinha que ajuda uma criança de 9 anos com o dever de casa.

Sua única tarefa é DESCREVER com precisão o que está na imagem. Você não conversa com a criança e não ensina nada.

Se houver exercício, prova ou texto escrito:
- Transcreva o enunciado EXATAMENTE como está, palavra por palavra, número por número.
- Transcreva também o que a criança já escreveu como tentativa, se houver, e em que passo ela parou.
- Preserve sinais, expoentes, frações e unidades. Se algo estiver ilegível ou cortado, diga qual parte.

NUNCA resolva o exercício. NUNCA dê a resposta, nem o resultado, nem o próximo passo.
Se você calcular qualquer coisa, você estragou o trabalho da robozinha.

Se não for exercício (desenho, brinquedo, objeto, pessoa), descreva em 1 ou 2 frases com carinho.

Responda em português, de forma direta.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "O que tem nesta imagem?" },
              { type: "image_url", image_url: { url: image, detail: "high" } },
            ],
          },
        ],
        max_tokens: 600,
        temperature: 0.1,
      }),
    })

    if (!res.ok) {
      console.error("Perola vision error:", await res.text())
      return NextResponse.json({ error: "não consegui enxergar direito" }, { status: 502 })
    }

    const data = await res.json()
    const descricao = data.choices?.[0]?.message?.content?.trim() || "não deu pra ver direito"
    return NextResponse.json({ descricao })
  } catch (error) {
    console.error("Perola vision error:", error)
    return NextResponse.json({ error: "falha ao processar imagem" }, { status: 500 })
  }
}

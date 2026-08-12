import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { addFato } from "@/lib/perola/memoria"

/**
 * Chamada pelo cliente quando a Pérola usa a função lembrar durante a
 * conversa. Guarda um fato curto sobre a criança pra próxima sessão.
 */

const MAX_LEN = 200

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "perola-memoria", 20)
  if (!rl.allowed) return rl.response

  try {
    const { fato } = await request.json()
    if (!fato || typeof fato !== "string" || !fato.trim()) {
      return NextResponse.json({ error: "fato obrigatório" }, { status: 400 })
    }

    const fatos = await addFato(fato.trim().slice(0, MAX_LEN))
    return NextResponse.json({ ok: true, total: fatos.length })
  } catch (error) {
    console.error("Perola memoria error:", error)
    return NextResponse.json({ error: "não consegui guardar isso" }, { status: 500 })
  }
}

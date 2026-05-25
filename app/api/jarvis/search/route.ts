import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "search", 30)
  if (!rl.allowed) return rl.response

  try {
    const { query } = await request.json()

    if (!query) {
      return NextResponse.json({ error: "Query vazia" }, { status: 400 })
    }

    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { headers: { "User-Agent": "JARVIS/1.0" } })
    const data = await res.json()

    const results: string[] = []

    if (data.AbstractText) {
      results.push(data.AbstractText)
    }

    if (data.Answer) {
      results.push(data.Answer)
    }

    if (results.length === 0 && data.RelatedTopics?.length > 0) {
      const topics = data.RelatedTopics
        .slice(0, 3)
        .filter((t: { Text?: string }) => t.Text)
        .map((t: { Text: string }) => t.Text)
      results.push(...topics)
    }

    const summary = results.length > 0
      ? results.join(" ")
      : "Não encontrei informações suficientes sobre esse tema."

    return NextResponse.json({ summary, query })
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Erro na busca" }, { status: 500 })
  }
}

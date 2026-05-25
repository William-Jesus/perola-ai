import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "news", 30)
  if (!rl.allowed) return rl.response

  try {
    const { topic } = await request.json()

    const query = topic ? `${topic}&hl=pt-BR&gl=BR&ceid=BR:pt-419` : `hl=pt-BR&gl=BR&ceid=BR:pt-419`
    const url = topic
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
      : `https://news.google.com/rss?${query}`

    const res = await fetch(url, { headers: { "User-Agent": "JARVIS/1.0" } })
    const xml = await res.text()

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    const news = items.slice(0, 5).map((item) => {
      const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        ?.replace(/&amp;/g, "&")
        ?.replace(/&lt;/g, "<")
        ?.replace(/&gt;/g, ">")
        ?.trim() || ""
      const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || ""
      return source ? `${title} (${source})` : title
    }).filter(Boolean)

    if (news.length === 0) {
      return NextResponse.json({ summary: "Não encontrei notícias recentes sobre esse tema." })
    }

    const summary = `Aqui estão as principais notícias${topic ? ` sobre ${topic}` : ""}: ${news.join(". ")}`
    return NextResponse.json({ summary, news })
  } catch (error) {
    console.error("News error:", error)
    return NextResponse.json({ error: "Erro ao buscar notícias" }, { status: 500 })
  }
}

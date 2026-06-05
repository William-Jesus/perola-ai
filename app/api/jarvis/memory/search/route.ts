import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { checkRateLimit } from "@/lib/rate-limit"

const CONVERSATION_INDEX_FILE = process.env.CONVERSATION_INDEX_PATH || path.join(process.cwd(), "data", "conversation-index.json")

interface ConversationEntry {
  id: string
  summary: string
  embedding?: number[]
  createdAt: string
}

interface ConversationIndex {
  entries: ConversationEntry[]
  lastUpdated: string
}

async function readIndex(): Promise<ConversationIndex> {
  try {
    const content = await fs.readFile(CONVERSATION_INDEX_FILE, "utf-8")
    return JSON.parse(content)
  } catch {
    return { entries: [], lastUpdated: new Date().toISOString() }
  }
}

async function writeIndex(index: ConversationIndex) {
  await fs.mkdir(path.dirname(CONVERSATION_INDEX_FILE), { recursive: true })
  await fs.writeFile(CONVERSATION_INDEX_FILE, JSON.stringify(index, null, 2), "utf-8")
}

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  })
  if (!res.ok) throw new Error(`Embedding error: ${res.status}`)
  const data = await res.json()
  return data.data[0].embedding
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "memory-search", 20)
  if (!rl.allowed) return rl.response

  try {
    const { query, limit = 3, recent = false } = await request.json()

    const index = await readIndex()
    if (!index.entries.length) {
      return NextResponse.json({ context: "", entries: [] })
    }

    // Fast path: just return the N most recent conversations, no embeddings needed
    if (recent === true) {
      const recentEntries = [...index.entries]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)

      if (!recentEntries.length) {
        return NextResponse.json({ context: "", entries: [] })
      }

      const context = recentEntries.map((e) => `- ${e.summary}`).join("\n")
      return NextResponse.json({
        context,
        recent: true,
        entries: recentEntries.map((e) => ({ id: e.id, summary: e.summary })),
      })
    }

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "No API key" }, { status: 500 })
    }

    // Lazy-compute missing embeddings, but cap at 5 per request to avoid long delays
    let needsWrite = false
    const entriesMissingEmbedding = index.entries.filter((e) => !e.embedding).slice(0, 5)
    for (const entry of entriesMissingEmbedding) {
      try {
        entry.embedding = await getEmbedding(entry.summary, apiKey)
        needsWrite = true
      } catch {
        // Skip entries that fail embedding
      }
    }

    if (needsWrite) {
      index.lastUpdated = new Date().toISOString()
      await writeIndex(index)
    }

    const queryEmbedding = await getEmbedding(query, apiKey)

    const scored = index.entries
      .filter((e) => e.embedding)
      .map((e) => ({
        entry: e,
        score: cosineSimilarity(queryEmbedding, e.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    if (!scored.length) {
      return NextResponse.json({ context: "", entries: [] })
    }

    const context = scored.map((s) => `- ${s.entry.summary}`).join("\n")

    return NextResponse.json({
      context,
      entries: scored.map((s) => ({ id: s.entry.id, summary: s.entry.summary, score: s.score })),
    })
  } catch (error) {
    console.error("Memory search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { checkRateLimit } from "@/lib/rate-limit"

const MEMORY_FILE = process.env.MEMORY_PATH || path.join(process.cwd(), "data", "memory.json")
const CONVERSATION_INDEX_FILE = process.env.CONVERSATION_INDEX_PATH || path.join(process.cwd(), "data", "conversation-index.json")

interface MemoryItem {
  text: string
  category: "fact" | "preference" | "routine" | "relationship"
  confidence: number
  createdAt: string
  updatedAt: string
  source: string // conversation id or context
}

interface Memory {
  items: MemoryItem[]
  lastUpdated: string
  version: number
}

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

async function readMemory(): Promise<Memory> {
  try {
    const content = await fs.readFile(MEMORY_FILE, "utf-8")
    const parsed = JSON.parse(content)
    // Migrate from old format
    if (Array.isArray(parsed.facts) || Array.isArray(parsed.preferences)) {
      const items: MemoryItem[] = []
      for (const f of parsed.facts || []) {
        items.push({
          text: f,
          category: "fact",
          confidence: 0.8,
          createdAt: parsed.lastUpdated || new Date().toISOString(),
          updatedAt: parsed.lastUpdated || new Date().toISOString(),
          source: "legacy",
        })
      }
      for (const p of parsed.preferences || []) {
        items.push({
          text: p,
          category: "preference",
          confidence: 0.8,
          createdAt: parsed.lastUpdated || new Date().toISOString(),
          updatedAt: parsed.lastUpdated || new Date().toISOString(),
          source: "legacy",
        })
      }
      return { items, lastUpdated: new Date().toISOString(), version: 2 }
    }
    return { version: 2, items: [], ...parsed }
  } catch {
    return { items: [], lastUpdated: new Date().toISOString(), version: 2 }
  }
}

async function writeMemory(memory: Memory) {
  await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true })
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8")
}

async function readConversationIndex(): Promise<ConversationIndex> {
  try {
    const content = await fs.readFile(CONVERSATION_INDEX_FILE, "utf-8")
    return JSON.parse(content)
  } catch {
    return { entries: [], lastUpdated: new Date().toISOString() }
  }
}

async function writeConversationIndex(index: ConversationIndex) {
  await fs.mkdir(path.dirname(CONVERSATION_INDEX_FILE), { recursive: true })
  await fs.writeFile(CONVERSATION_INDEX_FILE, JSON.stringify(index, null, 2), "utf-8")
}

function similarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  const wa = normalize(a)
  const wb = normalize(b)
  if (wa.length === 0 || wb.length === 0) return 0
  const setA = new Set(wa)
  const setB = new Set(wb)
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  return intersection.size / Math.max(setA.size, setB.size)
}

function mergeItems(existing: MemoryItem[], incoming: MemoryItem[]): MemoryItem[] {
  const merged = [...existing]
  for (const item of incoming) {
    const duplicateIndex = merged.findIndex(
      (m) => similarity(m.text, item.text) > 0.65 && m.category === item.category
    )
    if (duplicateIndex >= 0) {
      // Update existing with newer info if confidence is higher
      if (item.confidence >= merged[duplicateIndex].confidence) {
        merged[duplicateIndex] = { ...item, createdAt: merged[duplicateIndex].createdAt }
      }
    } else {
      merged.push(item)
    }
  }
  // Keep max 40 items, prioritize by confidence and recency
  return merged
    .sort((a, b) => {
      const scoreA = a.confidence * 0.6 + new Date(a.updatedAt).getTime() * 0.0000001
      const scoreB = b.confidence * 0.6 + new Date(b.updatedAt).getTime() * 0.0000001
      return scoreB - scoreA
    })
    .slice(0, 40)
}

function formatForPrompt(memory: Memory): string {
  if (!memory.items.length) return ""
  const facts = memory.items.filter((i) => i.category === "fact").slice(0, 12)
  const prefs = memory.items.filter((i) => i.category === "preference").slice(0, 8)
  const routines = memory.items.filter((i) => i.category === "routine").slice(0, 5)

  const parts: string[] = []
  if (facts.length) parts.push(`FATOS:\n${facts.map((f) => `- ${f.text}`).join("\n")}`)
  if (prefs.length) parts.push(`PREFERÊNCIAS:\n${prefs.map((p) => `- ${p.text}`).join("\n")}`)
  if (routines.length) parts.push(`ROTINAS:\n${routines.map((r) => `- ${r.text}`).join("\n")}`)

  return parts.length ? `\n\n=== MEMÓRIA DO USUÁRIO ===\n${parts.join("\n\n")}\n=== FIM DA MEMÓRIA ===` : ""
}

export async function GET(request: Request) {
  const rl = checkRateLimit(request, "memory-get", 10)
  if (!rl.allowed) return rl.response

  const memory = await readMemory()
  return NextResponse.json({
    items: memory.items,
    lastUpdated: memory.lastUpdated,
    formatted: formatForPrompt(memory),
  })
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "memory-post", 10)
  if (!rl.allowed) return rl.response

  try {
    const { messages, conversationId } = await request.json()
    if (!messages?.length) return NextResponse.json({ ok: true })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 })

    const conversation = messages
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuário" : "JARVIS"}: ${m.content}`)
      .join("\n")

    // Extract structured memory items
    const extractionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analise esta conversa entre o usuário e o JARVIS (assistente de IA).
Extraia informações importantes sobre o usuário que serão úteis em conversas futuras.

Regras:
- Extraia APENAS informações factuais, preferências, rotinas ou relacionamentos.
- NÃO extraia informações triviais ou temporárias (ex: "o usuário disse oi").
- NÃO invente informações que não estão na conversa.
- Seja extremamente conciso. Cada item deve ser uma única frase direta.
- Categorize cada item: "fact" (fato objetivo), "preference" (preferência/gosto), "routine" (rotina/hábito), "relationship" (pessoas/relacionamentos).
- Atribua confidence: 0.9 para informações explícitas, 0.7 para inferências razoáveis, 0.5 para inferências frágeis.

Responda APENAS com JSON válido no formato:
{
  "items": [
    { "text": "...", "category": "fact|preference|routine|relationship", "confidence": 0.9 }
  ]
}

Máximo 8 itens. Nada além do JSON.`,
          },
          { role: "user", content: conversation },
        ],
        max_tokens: 600,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    })

    const extractionData = await extractionRes.json()
    const text = extractionData.choices?.[0]?.message?.content || "{}"

    let extracted: { items?: Array<{ text: string; category: string; confidence: number }> } = {}
    try {
      extracted = JSON.parse(text)
    } catch {
      return NextResponse.json({ ok: true })
    }

    const now = new Date().toISOString()
    const incomingItems: MemoryItem[] = (extracted.items || [])
      .filter((i) => i.text && i.text.length > 5 && i.text.length < 200)
      .map((i) => ({
        text: i.text.trim(),
        category: ["fact", "preference", "routine", "relationship"].includes(i.category) ? (i.category as MemoryItem["category"]) : "fact",
        confidence: Math.max(0.3, Math.min(1, i.confidence || 0.7)),
        createdAt: now,
        updatedAt: now,
        source: conversationId || "unknown",
      }))

    const existing = await readMemory()
    const mergedItems = mergeItems(existing.items, incomingItems)

    const merged: Memory = {
      items: mergedItems,
      lastUpdated: now,
      version: 2,
    }

    await writeMemory(merged)

    // Also generate a conversation summary for RAG
    try {
      const summaryRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Resuma esta conversa em UMA frase curta (máx 20 palavras). Foque no que o usuário pediu ou discutiu. Responda apenas a frase, sem aspas.",
            },
            { role: "user", content: conversation },
          ],
          max_tokens: 80,
          temperature: 0.3,
        }),
      })
      const summaryData = await summaryRes.json()
      const summary = (summaryData.choices?.[0]?.message?.content || "").trim().slice(0, 200)

      if (summary && conversationId) {
        const index = await readConversationIndex()
        // Remove old entry for same conversation if exists
        index.entries = index.entries.filter((e) => e.id !== conversationId)
        index.entries.push({
          id: conversationId,
          summary,
          createdAt: now,
        })
        // Keep last 50 conversations
        index.entries = index.entries.slice(-50)
        index.lastUpdated = now
        await writeConversationIndex(index)
      }
    } catch {
      // Non-critical: summary generation failure shouldn't block memory save
    }

    return NextResponse.json({ ok: true, extracted: incomingItems.length, total: merged.items.length })
  } catch (error) {
    console.error("Memory error:", error)
    return NextResponse.json({ error: "Failed to save memory" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { checkRateLimit } from "@/lib/rate-limit"

const MEMORY_FILE = process.env.MEMORY_PATH || path.join(process.cwd(), "data", "memory.json")

interface Memory {
  facts: string[]
  preferences: string[]
  lastUpdated: string
}

async function readMemory(): Promise<Memory> {
  try {
    const content = await fs.readFile(MEMORY_FILE, "utf-8")
    return JSON.parse(content)
  } catch {
    return { facts: [], preferences: [], lastUpdated: new Date().toISOString() }
  }
}

async function writeMemory(memory: Memory) {
  await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true })
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8")
}

export async function GET(request: Request) {
  const rl = checkRateLimit(request, "memory-get", 10)
  if (!rl.allowed) return rl.response


  const memory = await readMemory()
  return NextResponse.json(memory)
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "memory-post", 10)
  if (!rl.allowed) return rl.response

  try {
    const { messages } = await request.json()
    if (!messages?.length) return NextResponse.json({ ok: true })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 })

    const conversation = messages
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuário" : "JARVIS"}: ${m.content}`)
      .join("\n")

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analise esta conversa e extraia informações importantes sobre o usuário para o JARVIS lembrar no futuro.
Retorne um JSON com dois arrays:
- "facts": fatos objetivos (nome, trabalho, dispositivos, projetos, rotinas)
- "preferences": preferências e estilo de comunicação
Seja conciso. Máximo 5 itens em cada array. Apenas informações realmente úteis para futuras conversas.
Responda APENAS com JSON válido, sem markdown.`,
          },
          { role: "user", content: conversation },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    })

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || "{}"

    let extracted: { facts?: string[]; preferences?: string[] } = {}
    try {
      extracted = JSON.parse(text)
    } catch {
      return NextResponse.json({ ok: true })
    }

    const existing = await readMemory()

    const merged: Memory = {
      facts: [...new Set([...existing.facts, ...(extracted.facts || [])])].slice(-20),
      preferences: [...new Set([...existing.preferences, ...(extracted.preferences || [])])].slice(-10),
      lastUpdated: new Date().toISOString(),
    }

    await writeMemory(merged)
    return NextResponse.json({ ok: true, merged })
  } catch (error) {
    console.error("Memory error:", error)
    return NextResponse.json({ error: "Failed to save memory" }, { status: 500 })
  }
}

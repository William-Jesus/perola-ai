import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "chat", 30)
  if (!rl.allowed) return rl.response

  try {
    const { query, history } = await request.json()

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

    const response = await fetch("http://localhost:8000/api/jarvis/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: query, session_id: "default" }),
    })

    if (!response.ok) {
      throw new Error("Python server request failed")
    }

    const data = await response.json()

    return NextResponse.json({ response: data.response })
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}

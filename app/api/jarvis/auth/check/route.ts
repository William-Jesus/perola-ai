import { NextResponse } from "next/server"
import { validateSession } from "@/lib/session"
import { getCredential } from "@/lib/passkey-store"

export async function GET() {
  const [authenticated, credential] = await Promise.all([validateSession(), getCredential()])
  return NextResponse.json({
    authenticated,
    registered: !!credential,
  })
}

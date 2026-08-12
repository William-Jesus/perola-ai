import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildPerolaPrompt, EXPRESSOES } from "@/lib/perola/prompt"
import { getFatos } from "@/lib/perola/memoria"

/**
 * Sessão de voz da Pérola (OpenAI Realtime).
 *
 * ISOLAMENTO PROPOSITAL — esta rota é separada de /api/jarvis/session.
 * A Pérola recebe SOMENTE três funções: mudar a própria expressão, ver a
 * câmera e guardar um fato pra próxima sessão. Ela não tem run_command,
 * open_app, read_file, write_file, list_directory, get_agents nem
 * ask_claude.
 *
 * Isso é controle de acesso no servidor, não no prompt. Prompt se convence;
 * uma lista de ferramentas que não existe, não.
 * Não adicione ferramenta aqui sem pensar em quem está do outro lado.
 */

const VOZ = process.env.PEROLA_VOICE || "coral"
const NOME = process.env.PEROLA_NOME || "amiga"
const IDADE = Number(process.env.PEROLA_IDADE) || 9

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "perola-session", 10)
  if (!rl.allowed) return rl.response

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 500 })
    }

    const fatos = await getFatos()

    const body = {
      session: {
        type: "realtime" as const,
        model: "gpt-realtime-2",
        audio: {
          input: {
            // far_field: mic embutido de laptop/tablet a alguma distância,
            // não headset — o cenário real de uma criança de 9 anos falando
            // do outro lado do quarto, com TV/irmão/casa ao fundo.
            noise_reduction: { type: "far_field" },
          },
          output: { voice: VOZ },
        },
        instructions: buildPerolaPrompt({ nome: NOME, idade: IDADE, fatos }),
        tools: [
          {
            type: "function" as const,
            name: "mudar_expressao",
            description:
              "Muda a expressão do rosto da Pérola na tela. Chame sempre que seu estado emocional mudar, ANTES de falar.",
            parameters: {
              type: "object",
              properties: {
                expressao: {
                  type: "string",
                  enum: [...EXPRESSOES],
                  description: "A expressão a mostrar",
                },
              },
              required: ["expressao"],
            },
          },
          {
            type: "function" as const,
            name: "ver_camera",
            description:
              "Captura uma foto pela câmera para ver o que a menina está mostrando — dever de casa, caderno, desenho, objeto. Use quando ela disser 'olha isso', 'me ajuda com esse exercício', 'o que é isso'.",
            parameters: { type: "object", properties: {} },
          },
          {
            type: "function" as const,
            name: "lembrar",
            description:
              "Guarda um fato curto sobre a criança pra lembrar na próxima conversa — nome de uma amiga, um hobby, uma dificuldade recorrente numa matéria. Só use pra coisa que vale a pena lembrar depois, não pra assunto do momento.",
            parameters: {
              type: "object",
              properties: {
                fato: {
                  type: "string",
                  description: "Frase curta e específica, ex: 'gosta de desenhar cavalos'",
                },
              },
              required: ["fato"],
            },
          },
        ],
      },
    }

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error("Perola session error:", await response.text())
      throw new Error("Falha ao criar sessão")
    }

    const data = await response.json()
    return NextResponse.json({ client_secret: { value: data.value } })
  } catch (error) {
    console.error("Perola session error:", error)
    return NextResponse.json({ error: "Falha ao criar sessão" }, { status: 500 })
  }
}

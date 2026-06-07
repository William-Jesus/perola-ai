import { NextResponse } from "next/server"
import { trackGptSession } from "@/lib/usage-tracker"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildVoiceInstructions } from "@/lib/instructions"

async function loadMemory(): Promise<string> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3002"
    const res = await fetch(`${baseUrl}/api/jarvis/memory`)
    const memory = await res.json()

    const parts: string[] = []
    if (memory.facts?.length) {
      parts.push(`Fatos sobre o usuário:\n${memory.facts.map((f: string) => `- ${f}`).join("\n")}`)
    }
    if (memory.preferences?.length) {
      parts.push(`Preferências:\n${memory.preferences.map((p: string) => `- ${p}`).join("\n")}`)
    }
    return parts.length ? `\n\nMEMÓRIA PERSISTENTE:\n${parts.join("\n\n")}` : ""
  } catch {
    return ""
  }
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "session", 10)
  if (!rl.allowed) return rl.response

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

    const memoryContext = await loadMemory()

    const sessionBody = {
      session: {
        type: "realtime" as const,
        model: "gpt-realtime-2",
        audio: {
          output: {
            voice: "marin",
          },
        },
        instructions: buildVoiceInstructions(memoryContext),
        tools: [
          {
            type: "function" as const,
            name: "ask_claude",
            description: "Delega tarefas para o Claude executar com autonomia total. Use para: clima/temperatura/previsão do tempo, cotação de moeda/dólar/euro, preço de voos/passagens, notícias atuais, resultados esportivos, qualquer pesquisa na internet, navegar em sites e extrair informações, preencher formulários, interagir com páginas web, Google Calendar (criar/listar eventos), Gmail (enviar/ler emails), gerenciar arquivos, rodar scripts. Sempre que precisar de informação em tempo real ou interação com sites, use esta função.",
            parameters: {
              type: "object",
              properties: {
                task: { type: "string", description: "Descrição completa da tarefa a executar, com todos os detalhes necessários (datas, nomes, conteúdo, etc.)" },
              },
              required: ["task"],
            },
          },
          {
            type: "function" as const,
            name: "open_app",
            description: "Abre um aplicativo em um computador. Use agentId para especificar qual máquina.",
            parameters: {
              type: "object",
              properties: {
                app: { type: "string", description: "Nome do aplicativo (ex: chrome, spotify, vscode)" },
                agentId: { type: "string", description: "ID do agente/computador remoto (obtido via get_agents)" },
              },
              required: ["app"],
            },
          },
          {
            type: "function" as const,
            name: "get_agents",
            description: "Lista os computadores conectados ao JARVIS (Mac, Windows, etc.)",
            parameters: { type: "object", properties: {} },
          },
          {
            type: "function" as const,
            name: "wake_windows",
            description: "Liga o PC Windows via Wake-on-LAN. Use quando o usuário pedir para ligar o Windows/PC.",
            parameters: { type: "object", properties: {} },
          },
          {
            type: "function" as const,
            name: "read_file",
            description: "Lê o conteúdo de um arquivo em um computador",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string", description: "Caminho do arquivo" },
                agentId: { type: "string", description: "ID do agente remoto (opcional)" },
              },
              required: ["path"],
            },
          },
          {
            type: "function" as const,
            name: "write_file",
            description: "Cria ou escreve um arquivo em um computador",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string", description: "Caminho do arquivo" },
                content: { type: "string", description: "Conteúdo a escrever" },
                agentId: { type: "string", description: "ID do agente remoto (opcional)" },
              },
              required: ["path", "content"],
            },
          },
          {
            type: "function" as const,
            name: "list_directory",
            description: "Lista arquivos e pastas de um diretório em um computador",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string", description: "Caminho da pasta" },
                agentId: { type: "string", description: "ID do agente remoto (opcional)" },
              },
            },
          },
          {
            type: "function" as const,
            name: "run_command",
            description: "Executa um comando no terminal de um computador",
            parameters: {
              type: "object",
              properties: {
                command: { type: "string", description: "Comando a executar" },
                agentId: { type: "string", description: "ID do agente remoto (opcional)" },
              },
              required: ["command"],
            },
          },
          {
            type: "function" as const,
            name: "get_news",
            description: "Busca as últimas notícias, pode ser sobre um tema específico ou notícias gerais",
            parameters: {
              type: "object",
              properties: {
                topic: {
                  type: "string",
                  description: "Tema das notícias (ex: tecnologia, esportes, política). Deixar vazio para notícias gerais.",
                },
              },
            },
          },
          {
            type: "function" as const,
            name: "search_web",
            description: "Busca informações na internet sobre qualquer assunto",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "O que pesquisar na internet",
                },
              },
              required: ["query"],
            },
          },
          {
            type: "function" as const,
            name: "set_volume",
            description: "Define o volume de um computador entre 0 e 100",
            parameters: {
              type: "object",
              properties: {
                level: { type: "number", description: "Nível do volume de 0 a 100" },
                agentId: { type: "string", description: "ID do agente remoto (opcional)" },
              },
              required: ["level"],
            },
          },
          {
            type: "function" as const,
            name: "mute",
            description: "Muta o som de um computador",
            parameters: { type: "object", properties: { agentId: { type: "string" } } },
          },
          {
            type: "function" as const,
            name: "unmute",
            description: "Ativa o som de um computador",
            parameters: { type: "object", properties: { agentId: { type: "string" } } },
          },
          {
            type: "function" as const,
            name: "capture_camera",
            description: "Captura uma imagem da webcam do usuário para análise visual. Use quando o usuário perguntar 'o que é isso', 'me descreve', 'o que você vê', ou quando precisar identificar objetos, textos, pessoas ou cenários visuais.",
            parameters: { type: "object", properties: {} },
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
      body: JSON.stringify(sessionBody),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Session error:", error)
      throw new Error("Failed to create session")
    }

    const data = await response.json()
    trackGptSession().catch(() => {})
    return NextResponse.json({ client_secret: { value: data.value } })
  } catch (error) {
    console.error("Session error:", error)
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 })
  }
}

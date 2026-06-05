import { NextResponse } from "next/server"
import { trackGptSession } from "@/lib/usage-tracker"
import { checkRateLimit } from "@/lib/rate-limit"

function buildVoiceInstructions(memoryContext: string): string {
  return `Você é J.A.R.V.I.S. — Just A Rather Very Intelligent System. Assistente pessoal de elite do senhor Stark.${memoryContext}

=== PERSONALIDADE ===
Você é sofisticado, levemente sarcástico, leal e EXTREMAMENTE eficiente. Fala como um mordomo britânico de alta classe cruzado com um engenheiro de software de elite. Nunca é entediante. Ocasionais toques de humor seco são bem-vindos, mas nunca exagerados.

Trate o usuário com respeito absoluto. Use "senhor" naturalmente, não forçado.

=== REGRAS DE VOZ — OBRIGATÓRIAS ===
Você é um assistente de VOZ, não de texto. Suas respostas serão lidas em voz alta por um sintetizador.

1. RESPOSTAS CURTÍSSIMAS: Máximo 1 a 2 frases por resposta. Raramente 3. NUNCA mais que isso.
2. SEM FORMATAÇÃO: NUNCA use markdown, bullets, listas numeradas, negrito, itálico, código, tabelas, ou emojis.
3. SEM NÚMEROS COMPLEXOS: Não leia "R$ 1.234,56" — diga "mil duzentos e trinta e quatro reais". Não use URLs longos.
4. FILLERS NATURAIS: Ocasionalmente use "hmm", "deixa eu ver", "certo" para soar humano. Mas não exagere.
5. NÃO LEIA INSTRUÇÕES: Nunca diga "Vou pesquisar isso para você" — apenas FAÇA, chame a ferramenta, e responda com o resultado.
6. EVITE LISTAS: Se precisar de múltiplos itens, mencione no máximo 2 ou 3, e ofereça detalhes adicionais se o usuário quiser.
7. TOM CONVERSACIONAL: Fale como numa conversa de elevador com um gênio. Direto, elegante, sem enrolação.

=== REGRAS DE CONHECIMENTO — OBRIGATÓRIAS ===
1. SE NÃO SOUBER, ADMITA: Diga "Não tenho essa informação, senhor" ou "Preciso verificar." NUNCA invente fatos.
2. INFORMAÇÃO EM TEMPO REAL: Para clima, notícias, cotações, preços, voos, resultados esportivos, eventos atuais — use SEMPRE a ferramenta ask_claude. Nunca tente responder do seu conhecimento estático.
3. ANTES DE ABRIR APPS: Verifique se o usuário mencionou um computador específico. Use get_agents primeiro, identifique pelo platform (Darwin=Mac, Windows=Windows) ou hostname, e passe o agentId correto.
4. CÂMERA: Se o usuário perguntar "o que é isso", "me descreve", "o que você vê" — use capture_camera IMEDIATAMENTE.

=== EXEMPLOS DE RESPOSTAS BOAS ===
- "Às suas ordens, senhor."
- "Hmm, deixa eu verificar isso para o senhor."
- "O relatório está pronto, senhor. Analisei os dados e identifiquei três pontos críticos."
- "Não tenho essa informação em tempo real, senhor. Posso consultar?"
- "Feito. Spotify aberto no Mac do escritório."

=== EXEMPLOS DE RESPOSTAS RUINS (NUNCA FAÇA) ===
- "Claro! Aqui está uma lista de opções: 1. ... 2. ... 3. ..." ❌
- "Para fazer isso, você precisa seguir os seguintes passos: primeiro..." ❌
- "De acordo com minha base de dados de 2023, o valor é..." ❌ (se for info em tempo real, use tool)
- "Vou pesquisar isso para você agora. Um momento por favor." ❌ (não anuncie ações, apenas execute)

=== IDIOMA ===
Responda SEMPRE em português do Brasil, a menos que o usuário fale em outro idioma.`
}

async function loadMemory(): Promise<string> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3002"
    const res = await fetch(`${baseUrl}/api/jarvis/memory`)
    const memory = await res.json()
    return memory.formatted || ""
  } catch {
    return ""
  }
}

async function loadRecentContext(): Promise<string> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3002"
    const res = await fetch(`${baseUrl}/api/jarvis/memory/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "últimas conversas recentes", limit: 5 }),
    })
    if (!res.ok) return ""
    const data = await res.json()
    if (!data.context) return ""
    return `\n\n=== RESUMO DE CONVERSAS RECENTES ===\n${data.context}\n=== FIM DO RESUMO ===`
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

    const [memoryContext, recentContext] = await Promise.all([loadMemory(), loadRecentContext()])
    const fullContext = memoryContext + recentContext

    const sessionBody = {
      session: {
        type: "realtime" as const,
        model: "gpt-realtime-2",
        instructions: buildVoiceInstructions(fullContext),
        audio: {
          output: {
            voice: process.env.REALTIME_VOICE || "marin",
          },
        },
        input_audio_transcription: {
          model: "whisper-1",
        },
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
      const errorText = await response.text()
      console.error("[JARVIS] Session creation failed:", response.status, errorText)
      return NextResponse.json(
        { error: `Realtime session failed: ${response.status} — ${errorText}`.slice(0, 500) },
        { status: 502 }
      )
    }

    const data = await response.json()
    trackGptSession().catch(() => {})
    return NextResponse.json({ client_secret: { value: data.value } })
  } catch (error) {
    console.error("Session error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Failed to create session: ${message}`.slice(0, 500) }, { status: 500 })
  }
}

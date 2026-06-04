"use client"

import { useState, useRef, useEffect, useCallback } from "react"
// Wake word via Web Speech API (não precisa de chave externa)
import { VoiceVisualizer } from "./voice-visualizer"
import { StatusIndicator } from "./status-indicator"
import { ConversationPanel } from "./conversation-panel"
import { HudOverlay } from "./hud-overlay"
import { CircularInterface } from "./circular-interface"
import { ConversationSidebar, type SavedConversation } from "./conversation-sidebar"
import { NeuralBackground } from "./neural-background"
import { CameraFeed, type CameraFeedRef } from "./camera-feed"

export type JarvisState = "idle" | "listening" | "thinking" | "speaking"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export function JarvisCore() {
  const [state, setState] = useState<JarvisState>("idle")
  const [messages, setMessages] = useState<Message[]>([])
  const [transcript, setTranscript] = useState("")
  const [textInput, setTextInput] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt")
  const [connected, setConnected] = useState(false)
  const [conversationId] = useState(() => crypto.randomUUID())

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const stateRef = useRef<JarvisState>("idle")
  const currentUserTranscriptRef = useRef("")
  const currentAssistantTranscriptRef = useRef("")
  const isRespondingRef = useRef(false)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const micTrackRef = useRef<MediaStreamTrack | null>(null)
  const wakeWordActiveRef = useRef(false)
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isAwake, setIsAwake] = useState(false)
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const WAKE_TIMEOUT = 20000
  const FOLLOWUP_TIMEOUT = 8000
  const MAX_RECONNECT_ATTEMPTS = 5

  const cameraRef = useRef<CameraFeedRef>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isListeningRef = useRef(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    setMounted(true)
  }, [])

  const startAudioVisualizer = (stream: MediaStream): MediaStream => {
    const ctx = new AudioContext()
    audioContextRef.current = ctx
    analyserRef.current = ctx.createAnalyser()
    analyserRef.current.fftSize = 256

    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    const dest = ctx.createMediaStreamDestination()

    // Fade in over 500ms to skip mic warm-up / AGC calibration noise
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5)

    source.connect(gain)
    gain.connect(analyserRef.current)
    gain.connect(dest)

    const loop = () => {
      if (!analyserRef.current) return
      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(data)
      const level = data.reduce((a, b) => a + b) / data.length / 255
      setAudioLevel(level)
      animationFrameRef.current = requestAnimationFrame(loop)
    }
    animationFrameRef.current = requestAnimationFrame(loop)

    return dest.stream
  }

  const cancelResponse = () => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({ type: "response.cancel" }))
    }
  }

  // --- Wake Word via Web Speech API ---
  const stopWakeWordListener = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
      isListeningRef.current = false
      console.log("[JARVIS] Wake word listener parado")
    }
  }, [])

  const startWakeWordListener = useCallback(() => {
    if (isListeningRef.current) return
    if (typeof window === "undefined") return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.error("[JARVIS] SpeechRecognition não suportado neste navegador")
      return
    }
    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "pt-BR"
      recognitionRef.current = recognition
      isListeningRef.current = true

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase().trim()
          if ((transcript.includes("jarvis") || transcript.includes("jarvi")) && !wakeWordActiveRef.current) {
            console.log("[JARVIS] Wake word detectado via SpeechRecognition:", transcript)
            activateWakeRef.current?.()
          }
        }
      }

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech" || event.error === "aborted") return
        console.error("[JARVIS] SpeechRecognition error:", event.error)
      }

      recognition.onend = () => {
        isListeningRef.current = false
        if (!wakeWordActiveRef.current) {
          console.log("[JARVIS] SpeechRecognition encerrou, reiniciando...")
          setTimeout(() => startWakeWordListener(), 300)
        }
      }

      recognition.start()
      console.log("[JARVIS] Wake word listener iniciado (SpeechRecognition)")
    } catch (e) {
      console.error("[JARVIS] Erro ao iniciar SpeechRecognition:", e)
    }
  }, [])

  const activateWakeRef = useRef<(() => void) | null>(null)

  const deactivateWake = useCallback(() => {
    wakeWordActiveRef.current = false
    setIsAwake(false)
    setIsFollowUp(false)
    if (micTrackRef.current) micTrackRef.current.enabled = false
    if (wakeTimerRef.current) { clearTimeout(wakeTimerRef.current); wakeTimerRef.current = null }
    setState("idle")
    console.log("[JARVIS] Wake desativado, reiniciando wake word listener...")
    startWakeWordListener()
  }, [startWakeWordListener])

  const activateWake = useCallback(() => {
    wakeWordActiveRef.current = true
    setIsAwake(true)
    // Resume AudioContext se estiver suspenso (política de autoplay)
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume().catch(() => {})
    }
    if (micTrackRef.current) {
      micTrackRef.current.enabled = true
      console.log("[JARVIS] Mic habilitado, estado: awake")
    }
    stopWakeWordListener()
    setState("listening")
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
    wakeTimerRef.current = setTimeout(deactivateWake, WAKE_TIMEOUT)
  }, [stopWakeWordListener, deactivateWake])

  useEffect(() => {
    activateWakeRef.current = activateWake
  }, [activateWake])

  // Inicia wake word listener quando conectado
  useEffect(() => {
    if (connected && !wakeWordActiveRef.current) {
      startWakeWordListener()
    }
    return () => stopWakeWordListener()
  }, [connected, startWakeWordListener, stopWakeWordListener])

  const handleRealtimeEvent = (event: Record<string, unknown>) => {
    const type = event.type as string
    console.log("[JARVIS] Realtime event:", type, event)

    switch (type) {
      case "input_audio_buffer.speech_started":
        setState("listening")
        currentUserTranscriptRef.current = ""
        // Barge-in: user started speaking, cancel any ongoing response/TTS
        if (isRespondingRef.current) {
          cancelResponse()
          isRespondingRef.current = false
        }
        if (ttsAudioRef.current) {
          ttsAudioRef.current.pause()
          ttsAudioRef.current = null
          if (micTrackRef.current) micTrackRef.current.enabled = true
        }
        break

      case "input_audio_buffer.speech_stopped":
        setState("thinking")
        break

      case "conversation.item.input_audio_transcription.completed": {
        const text = (event.transcript as string) || ""
        currentUserTranscriptRef.current = text
        setTranscript(text)

        if (!text.trim()) break

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: text,
            timestamp: new Date(),
          },
        ])

        if (dcRef.current?.readyState === "open" && !isRespondingRef.current) {
          isRespondingRef.current = true
          dcRef.current.send(JSON.stringify({ type: "response.create" }))
        }
        break
      }

      case "response.output_item.added":
        setState("thinking")
        isRespondingRef.current = true
        currentAssistantTranscriptRef.current = ""
        break

      case "response.text.delta": {
        const delta = (event.delta as string) || ""
        currentAssistantTranscriptRef.current += delta
        setTranscript(currentAssistantTranscriptRef.current)
        break
      }

      case "response.function_call_arguments.done": {
        const callId = event.call_id as string
        const name = event.name as string
        const args = JSON.parse((event.arguments as string) || "{}")
        handleFunctionCall(callId, name, args)
        break
      }

      case "response.done": {
        let fullText = currentAssistantTranscriptRef.current

        let wasFunctionCall = false
        if (!fullText.trim()) {
          try {
            const response = event.response as Record<string, unknown>
            const output = response?.output as Array<Record<string, unknown>>
            wasFunctionCall = output?.some((item) => item.type === "function_call") ?? false
            const content = output?.[0]?.content as Array<Record<string, unknown>>
            fullText = (content?.[0]?.text as string) || ""
          } catch {}
        }

        // Function call response — wait for the follow-up response with actual text
        if (wasFunctionCall) {
          isRespondingRef.current = false
          currentAssistantTranscriptRef.current = ""
          setTranscript("")
          break
        }

        if (fullText.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: fullText,
              timestamp: new Date(),
            },
          ])
          speakWithElevenLabs(fullText)
        } else {
          deactivateWake()
        }
        isRespondingRef.current = false
        currentAssistantTranscriptRef.current = ""
        setTranscript("")
        break
      }

      case "error":
        console.error("Realtime error:", event)
        setState("listening")
        break
    }
  }

  const handleFunctionCall = async (callId: string, name: string, args: Record<string, unknown>) => {
    try {
      let result: any

      if (name === "capture_camera") {
        setState("thinking")
        const frame = await cameraRef.current?.captureFrame()
        if (!frame) {
          result = { error: "Não foi possível capturar a imagem da câmera." }
        } else {
          const visionRes = await fetch("/api/jarvis/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: frame }),
          })
          const visionData = await visionRes.json()
          result = { description: visionData.description || visionData.error || "Não consegui identificar." }
        }
      } else {
        const res = await fetch("/api/jarvis/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: name, params: args, agentId: args.agentId }),
        })
        result = await res.json()
      }

      if (dcRef.current?.readyState === "open") {
        dcRef.current.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(result),
          },
        }))
        dcRef.current.send(JSON.stringify({ type: "response.create" }))
      }
    } catch (error) {
      console.error("Function call error:", error)
    }
  }

  const speakWithElevenLabs = async (text: string) => {
    console.log("[JARVIS] Iniciando TTS para:", text.substring(0, 50) + "...")
    // Cancel previous TTS
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current = null
    }
    setState("speaking")
    if (micTrackRef.current) micTrackRef.current.enabled = false
    try {
      const response = await fetch("/api/jarvis/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      console.log("[JARVIS] TTS response status:", response.status)
      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown")
        console.error("[JARVIS] TTS failed:", response.status, errorText)
        throw new Error("TTS failed")
      }

      const audioBlob = await response.blob()
      console.log("[JARVIS] TTS audio blob size:", audioBlob.size)
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      ttsAudioRef.current = audio

      const cleanup = () => {
        ttsAudioRef.current = null
        URL.revokeObjectURL(audioUrl)
        // Resume AudioContext se necessário antes de reabilitar o mic
        if (audioContextRef.current?.state === "suspended") {
          audioContextRef.current.resume().catch(() => {})
        }
        // Follow-up window: keep mic active for 8s so user can respond naturally
        if (micTrackRef.current) micTrackRef.current.enabled = true
        setState("listening")
        setIsFollowUp(true)
        if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
        wakeTimerRef.current = setTimeout(() => {
          setIsFollowUp(false)
          deactivateWake()
        }, FOLLOWUP_TIMEOUT)
      }

      audio.onended = cleanup
      audio.onerror = (e) => {
        console.error("[JARVIS] Audio playback error:", e)
        cleanup()
      }

      await audio.play()
      console.log("[JARVIS] TTS audio playing")
    } catch (e) {
      console.error("[JARVIS] TTS error:", e)
      ttsAudioRef.current = null
      deactivateWake()
    }
  }

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    const attempts = reconnectAttemptsRef.current
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      setReconnecting(false)
      return
    }
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000)
    setReconnecting(true)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectAttemptsRef.current = attempts + 1
      connectInternal()
    }, delay)
  }, [])

  const connectInternal = async () => {
    // Clean up any existing connection first
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    try {
      // Get ephemeral token
      const sessionRes = await fetch("/api/jarvis/session", { method: "POST" })
      if (!sessionRes.ok) throw new Error("Failed to get session")
      const { client_secret } = await sessionRes.json()

      // Set up WebRTC
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Audio output do WebRTC desabilitado — usamos TTS (ElevenLabs/OpenAI)
      // const audioEl = document.createElement("audio")
      // audioEl.autoplay = true
      // audioElRef.current = audioEl
      // pc.ontrack = (e) => {
      //   audioEl.srcObject = e.streams[0]
      // }

      // Mic input
      console.log("[JARVIS] Solicitando acesso ao microfone...")
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      console.log("[JARVIS] Microfone concedido, tracks:", stream.getTracks().length)
      setMicPermission("granted")
      const processedStream = startAudioVisualizer(stream)
      const micTrack = processedStream.getTracks()[0]
      micTrackRef.current = micTrack
      micTrack.enabled = false // Start muted — wake word activates it
      pc.addTrack(micTrack)
      console.log("[JARVIS] Track adicionada ao PeerConnection")

      // Data channel for events
      const dc = pc.createDataChannel("oai-events")
      dcRef.current = dc
      dc.onmessage = (e) => handleRealtimeEvent(JSON.parse(e.data))
      dc.onopen = () => {
        setConnected(true)
        setReconnecting(false)
        reconnectAttemptsRef.current = 0
        setState("idle")
      }
      dc.onclose = () => {
        setConnected(false)
        setState("idle")
        stopWakeWordListener()
        scheduleReconnect()
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setConnected(false)
          scheduleReconnect()
        }
      }

      // SDP negotiation
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      )

      if (!sdpRes.ok) throw new Error("SDP negotiation failed")

      const answer = { type: "answer" as RTCSdpType, sdp: await sdpRes.text() }
      await pc.setRemoteDescription(answer)
    } catch (error) {
      console.error("Connection error:", error)
      setMicPermission("denied")
      scheduleReconnect()
    }
  }

  const connect = () => {
    reconnectAttemptsRef.current = 0
    connectInternal()
  }

  const sendTextMessage = (text: string) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") return

    dcRef.current.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      })
    )
    dcRef.current.send(JSON.stringify({ type: "response.create" }))
  }

  const saveMemory = async (msgs: Message[]) => {
    if (msgs.length < 2) return
    try {
      await fetch("/api/jarvis/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      })
    } catch {}
  }

  const saveConversation = async (msgs: Message[]) => {
    if (msgs.length < 2) return
    try {
      const res = await fetch("/api/jarvis/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs.slice(0, 4) }),
      })
      const { title } = await res.json()
      const conv: SavedConversation = {
        id: conversationId,
        title,
        messages: msgs.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })),
        createdAt: new Date().toISOString(),
      }
      const existing = JSON.parse(localStorage.getItem("jarvis_conversations") || "[]")
      const filtered = existing.filter((c: SavedConversation) => c.id !== conversationId)
      localStorage.setItem("jarvis_conversations", JSON.stringify([...filtered, conv]))
    } catch {}
  }

  const handleNewConversation = () => {
    if (messages.length > 1) {
      saveConversation(messages)
      saveMemory(messages)
    }
    setMessages([])
    window.location.reload()
  }

  const handleLoadConversation = (conv: SavedConversation) => {
    setMessages(
      conv.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })) as Message[]
    )
  }

  const handleActivate = () => {
    // Resume AudioContext em resposta a interação do usuário (política de autoplay)
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume().catch(() => {})
    }
    if (!connected) {
      connect()
    }
  }

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (textInput.trim() && connected) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: textInput.trim(),
          timestamp: new Date(),
        },
      ])
      sendTextMessage(textInput.trim())
      setTextInput("")
      setState("thinking")
    }
  }

  // Auto-save when messages change
  useEffect(() => {
    if (messages.length >= 2) saveConversation(messages)
  }, [messages])

  useEffect(() => {
    if (!mounted) return
    connect()
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {})
      if (pcRef.current) pcRef.current.close()
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause()
        ttsAudioRef.current = null
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
      cameraRef.current?.stop()
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[var(--jarvis-dark)]">
      <NeuralBackground />
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 200, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 200, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      <HudOverlay state={state} />
      <ConversationSidebar onLoad={handleLoadConversation} onNew={handleNewConversation} />

      <div className="relative z-10 flex h-full flex-col items-center justify-center p-4">
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <StatusIndicator state={state} transcript={transcript} />
          {reconnecting && (
            <p className="text-[10px] font-mono text-yellow-400/70 tracking-widest animate-pulse">
              RECONECTANDO...
            </p>
          )}
          {connected && !isAwake && !reconnecting && (
            <p className="text-[10px] font-mono text-cyan-500/40 tracking-widest animate-pulse">
              DIGA &quot;JARVIS&quot; PARA ATIVAR
            </p>
          )}
          {connected && isFollowUp && (
            <p className="text-[10px] font-mono text-cyan-400/60 tracking-widest animate-pulse">
              PODE CONTINUAR...
            </p>
          )}
        </div>

        {micPermission === "denied" && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 glass-panel rounded-md p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Permissão do microfone é necessária.
            </p>
            <button
              onClick={connect}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Ativar Microfone
            </button>
          </div>
        )}

        {!connected && micPermission !== "denied" && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 text-sm text-muted-foreground animate-pulse">
            {reconnecting ? "Reconectando ao JARVIS..." : "Conectando ao JARVIS..."}
          </div>
        )}

        <div className="relative">
          <CircularInterface state={state} />
          <div className="absolute inset-0 flex items-center justify-center">
            <VoiceVisualizer
              state={state}
              audioLevel={audioLevel}
              onActivate={handleActivate}
            />
          </div>
        </div>

        {/* Camera feed overlay */}
        <div className="absolute bottom-24 right-4 z-40">
          <CameraFeed ref={cameraRef} active={cameraActive} />
        </div>

        <div className="absolute bottom-4 left-4 right-4 z-50 flex flex-col items-center gap-2">
          <ConversationPanel messages={messages} />
          <form
            onSubmit={handleTextSubmit}
            className="w-full max-w-2xl rounded-md border border-cyan-300/25 bg-black/65 p-2 shadow-[0_0_22px_rgba(0,174,255,0.18)] backdrop-blur-md"
          >
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCameraActive((v) => !v)}
                className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
                  cameraActive
                    ? "border-cyan-400/60 bg-cyan-400/20 text-cyan-300"
                    : "border-cyan-300/20 bg-cyan-950/20 text-cyan-200/50 hover:text-cyan-200 hover:border-cyan-300/40"
                }`}
                title={cameraActive ? "Desativar câmera" : "Ativar câmera"}
              >
                {cameraActive ? "📷 ON" : "📷 OFF"}
              </button>
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={connected ? "Fale ou digite uma mensagem..." : "Conectando..."}
                disabled={!connected || state === "thinking" || state === "speaking"}
                className="min-w-0 flex-1 rounded-md border border-cyan-300/20 bg-cyan-950/20 px-3 py-2 font-mono text-sm text-cyan-50 placeholder:text-cyan-200/35 focus:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!textInput.trim() || !connected}
                className="rounded-md border border-cyan-300/30 bg-cyan-400 px-4 py-2 font-mono text-sm font-bold text-black transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

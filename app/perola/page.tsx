"use client"

import { useCallback, useRef, useState } from "react"
import { PerolaFace, type Expression } from "@/components/perola/perola-face"
import { CameraFeed, type CameraFeedRef } from "@/components/perola/camera-feed"

type Status = "desligada" | "ligando" | "ligada" | "erro"

/**
 * rede de segurança contra sessão esquecida aberta, não é feature de produto.
 * Fixo em código (não env var) de propósito: NEXT_PUBLIC_* é gravado no bundle
 * no build, e o .dockerignore exclui .env.local do build do Docker — uma env
 * var aqui pareceria configurável mas nunca teria efeito no deploy.
 */
const MAX_SESSAO_MIN = 20

/**
 * Tela da Pérola — conversa por voz via OpenAI Realtime.
 * Rode: npm run dev -> http://localhost:3000/perola
 */
export default function PerolaPage() {
  const [expression, setExpression] = useState<Expression>("dormindo")
  const [status, setStatus] = useState<Status>("desligada")
  const [erro, setErro] = useState("")
  const [camAtiva, setCamAtiva] = useState(false)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const camRef = useRef<CameraFeedRef | null>(null)
  const cronometroRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** expressão escolhida pela Pérola, pra voltar nela quando parar de falar */
  const baseExpr = useRef<Expression>("neutra")

  const enviar = (obj: unknown) => {
    if (dcRef.current?.readyState === "open") dcRef.current.send(JSON.stringify(obj))
  }

  const responderFuncao = (call_id: string, output: unknown) => {
    enviar({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id, output: JSON.stringify(output) },
    })
    enviar({ type: "response.create" })
  }

  const tratarEvento = useCallback(async (ev: any) => {
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        setExpression("curiosa")
        break

      case "response.created":
        setExpression("pensando")
        break

      case "output_audio_buffer.started":
        setExpression("falando")
        break

      case "output_audio_buffer.stopped":
        setExpression(baseExpr.current)
        break

      case "response.function_call_arguments.done": {
        const args = ev.arguments ? JSON.parse(ev.arguments) : {}

        if (ev.name === "mudar_expressao") {
          baseExpr.current = args.expressao as Expression
          setExpression(args.expressao)
          responderFuncao(ev.call_id, { ok: true })
        }

        if (ev.name === "ver_camera") {
          setCamAtiva(true)
          await camRef.current?.start()
          // dá um instante pro sensor estabilizar, senão sai foto preta
          await new Promise((r) => setTimeout(r, 700))
          const frame = await camRef.current?.captureFrame()
          setCamAtiva(false)
          camRef.current?.stop()

          if (!frame) {
            responderFuncao(ev.call_id, { erro: "não consegui ver, a câmera não abriu" })
            break
          }

          const r = await fetch("/api/perola/ver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: frame }),
          })
          const data = await r.json()
          responderFuncao(ev.call_id, { vejo: data.descricao ?? data.error })
        }

        if (ev.name === "lembrar") {
          const r = await fetch("/api/perola/memoria", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fato: args.fato }),
          })
          const data = await r.json()
          responderFuncao(ev.call_id, data.ok ? { ok: true } : { erro: data.error })
        }
        break
      }
    }
  }, [])

  async function ligar() {
    setStatus("ligando")
    setErro("")
    setExpression("pensando")

    try {
      const sessionRes = await fetch("/api/perola/session", { method: "POST" })
      if (!sessionRes.ok) throw new Error("não consegui criar a sessão")
      const { client_secret } = await sessionRes.json()

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // A voz vem pelo próprio WebRTC — é a voz do GPT, sem TTS separado.
      const audio = new Audio()
      audio.autoplay = true
      audioRef.current = audio
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      pc.addTrack(stream.getAudioTracks()[0])

      const dc = pc.createDataChannel("oai-events")
      dcRef.current = dc
      dc.onmessage = (e) => tratarEvento(JSON.parse(e.data))
      dc.onopen = () => {
        setStatus("ligada")
        setExpression("feliz")
        baseExpr.current = "neutra"
        // ela puxa conversa primeiro, senão a criança fica esperando
        enviar({ type: "response.create" })
        cronometroRef.current = setTimeout(desligar, MAX_SESSAO_MIN * 60_000)
      }
      dc.onclose = () => {
        setStatus("desligada")
        setExpression("dormindo")
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client_secret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      })
      if (!sdpRes.ok) throw new Error("falha na negociação de áudio")

      await pc.setRemoteDescription({ type: "answer" as RTCSdpType, sdp: await sdpRes.text() })
    } catch (e: any) {
      console.error(e)
      setErro(e?.message ?? "deu ruim")
      setStatus("erro")
      setExpression("triste")
    }
  }

  function desligar() {
    if (cronometroRef.current) clearTimeout(cronometroRef.current)
    cronometroRef.current = null
    dcRef.current?.close()
    pcRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (audioRef.current) audioRef.current.srcObject = null
    dcRef.current = null
    pcRef.current = null
    streamRef.current = null
    setStatus("desligada")
    setExpression("dormindo")
  }

  return (
    <main className="flex h-dvh flex-col items-center justify-center bg-black text-white">
      <div className="w-full max-w-xl px-6">
        <PerolaFace expression={expression} />
      </div>

      {/* câmera fica escondida — só serve pra capturar quando ela pede */}
      <div className={camAtiva ? "mt-4 w-40 overflow-hidden rounded-xl" : "hidden"}>
        <CameraFeed ref={camRef} active={camAtiva} />
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        {status !== "ligada" ? (
          <button
            onClick={ligar}
            disabled={status === "ligando"}
            className="rounded-full bg-[#5FE3D6] px-9 py-4 text-lg font-semibold text-[#00312c] transition active:scale-95 disabled:opacity-40"
          >
            {status === "ligando" ? "acordando..." : "falar com a Pérola"}
          </button>
        ) : (
          <button
            onClick={desligar}
            className="rounded-full border border-white/20 px-7 py-3 text-sm text-white/60 active:bg-white/10"
          >
            tchau
          </button>
        )}

        {status === "ligada" && (
          <p className="text-[11px] uppercase tracking-widest text-white/25">pode falar</p>
        )}
        {erro && <p className="max-w-xs text-center text-sm text-red-400/80">{erro}</p>}
      </div>
    </main>
  )
}

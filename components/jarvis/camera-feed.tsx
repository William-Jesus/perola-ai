"use client"

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react"

export interface CameraFeedRef {
  captureFrame: () => Promise<string | null>
  start: () => Promise<void>
  stop: () => void
}

interface CameraFeedProps {
  active: boolean
  onError?: (msg: string) => void
}

export const CameraFeed = forwardRef<CameraFeedRef, CameraFeedProps>(function CameraFeed({ active, onError }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt">("prompt")
  const [isStarting, setIsStarting] = useState(false)

  const startCamera = useCallback(async () => {
    if (streamRef.current) return
    setIsStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setPermission("granted")
    } catch (err) {
      console.error("Camera error:", err)
      setPermission("denied")
      onError?.("Permissão de câmera negada ou câmera não disponível.")
    } finally {
      setIsStarting(false)
    }
  }, [onError])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const captureFrame = useCallback(async (): Promise<string | null> => {
    if (!videoRef.current || !streamRef.current) {
      // Try to start camera first
      await startCamera()
      // Wait a moment for video to be ready
      await new Promise((r) => setTimeout(r, 500))
    }

    const video = videoRef.current
    if (!video || video.readyState < 2) return null

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    // Mirror horizontally for natural selfie feel
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to JPEG base64
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
    return dataUrl
  }, [startCamera])

  useImperativeHandle(ref, () => ({
    captureFrame,
    start: startCamera,
    stop: stopCamera,
  }))

  useEffect(() => {
    if (active && permission !== "denied") {
      startCamera()
    } else if (!active) {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [active, permission, startCamera, stopCamera])

  if (!active) return null

  return (
    <div className="relative overflow-hidden rounded-lg border border-cyan-400/40 bg-black/60 shadow-[0_0_20px_rgba(0,200,255,0.2)] backdrop-blur-sm transition-all duration-300">
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
      </div>

      {isStarting && (
        <div className="flex h-[135px] w-[180px] items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      )}

      {permission === "denied" ? (
        <div className="flex h-[135px] w-[180px] flex-col items-center justify-center p-2 text-center">
          <p className="text-[10px] text-cyan-300/70">Câmera bloqueada</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="block h-[135px] w-[180px] object-cover"
          style={{ transform: "scaleX(-1)" }}
          muted
          playsInline
          autoPlay
        />
      )}

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20">
        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" title="Recording" />
      </div>
    </div>
  )
})

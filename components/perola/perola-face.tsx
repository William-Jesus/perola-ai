"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Rosto da Pérola — v2, em SVG.
 *
 * Cada olho é uma cápsula (raio total nas pontas) com dois brilhos, ou um
 * traço curvo quando a expressão pede arco (feliz, orgulhosa, dormindo).
 * A pálpebra é um retângulo preto rotacionado por cima do olho — é ela que
 * cria dúvida, sono e tristeza sem precisar deformar o olho.
 *
 * Pra criar expressão nova, adicione uma entrada em EXPRESSIONS.
 */

export type Expression =
  | "neutra"
  | "feliz"
  | "pensando"
  | "curiosa"
  | "surpresa"
  | "triste"
  | "orgulhosa"
  | "dormindo"
  | "falando"

type Spec =
  | {
      shape: "solid"
      w: number
      h: number
      /** ângulo da pálpebra em graus (espelhado no olho direito). 0 = sem pálpebra */
      lid: number
      /** desloca a pálpebra na vertical */
      lidY: number
      glint: boolean
      face: string
      c: string
    }
  | {
      shape: "arc"
      w: number
      /** altura da curva. Negativo curva pra cima (sorriso), positivo pra baixo */
      curve: number
      /** espessura do traço */
      sw: number
      face: string
      c: string
    }

const EXPRESSIONS: Record<Expression, Spec> = {
  neutra: { shape: "solid", w: 74, h: 104, lid: 0, lidY: 0, glint: true, face: "", c: "#5FE3D6" },
  feliz: { shape: "arc", w: 78, curve: -40, sw: 17, face: "translate(0,-6)", c: "#6BE8B4" },
  pensando: { shape: "solid", w: 70, h: 96, lid: 14, lidY: -26, glint: true, face: "translate(-12,-8)", c: "#5FE3D6" },
  curiosa: { shape: "solid", w: 74, h: 104, lid: 10, lidY: -16, glint: true, face: "rotate(6 160 105)", c: "#7CD8F5" },
  surpresa: { shape: "solid", w: 88, h: 120, lid: 0, lidY: 0, glint: true, face: "scale(1.05)", c: "#9BE8FF" },
  triste: { shape: "solid", w: 70, h: 88, lid: 24, lidY: -14, glint: true, face: "translate(0,12)", c: "#6FA9E8" },
  orgulhosa: { shape: "arc", w: 82, curve: -34, sw: 19, face: "translate(0,-10)", c: "#FFD98A" },
  dormindo: { shape: "arc", w: 70, curve: 16, sw: 11, face: "translate(0,8)", c: "#2E6B66" },
  falando: { shape: "solid", w: 74, h: 104, lid: 0, lidY: 0, glint: true, face: "", c: "#5FE3D6" },
}

function Eye({ spec, side, blink, heightOverride }: { spec: Spec; side: 0 | 1; blink: boolean; heightOverride?: number }) {
  const mirror = side === 0 ? 1 : -1

  if (spec.shape === "arc" && !blink) {
    return (
      <path
        d={`M ${-spec.w / 2} 0 Q 0 ${spec.curve} ${spec.w / 2} 0`}
        fill="none"
        stroke={spec.c}
        strokeWidth={spec.sw}
        strokeLinecap="round"
        filter="url(#perola-glow)"
      />
    )
  }

  const w = spec.shape === "solid" ? spec.w : 74
  const baseH = spec.shape === "solid" ? spec.h : 104
  const h = blink ? 12 : (heightOverride ?? baseH)
  const rx = w / 2

  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} ry={rx} fill="url(#perola-eye)" filter="url(#perola-glow)" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} ry={rx} fill={spec.c} opacity={0.55} />

      {spec.shape === "solid" && spec.glint && !blink && (
        <>
          {/* brilho grande em cima + pontinho embaixo — é isso que dá vida ao olho */}
          <ellipse cx={-w * 0.17} cy={-h * 0.26} rx={w * 0.17} ry={h * 0.11} fill="#fff" opacity={0.85} />
          <circle cx={w * 0.19} cy={h * 0.24} r={w * 0.075} fill="#fff" opacity={0.45} />
        </>
      )}

      {spec.shape === "solid" && spec.lid !== 0 && !blink && (
        <g transform={`rotate(${spec.lid * mirror})`}>
          <rect x={-w} y={-h + spec.lidY} width={w * 2} height={h} fill="#000" />
        </g>
      )}
    </>
  )
}

interface PerolaFaceProps {
  expression?: Expression
  className?: string
}

export function PerolaFace({ expression = "neutra", className = "" }: PerolaFaceProps) {
  const [blink, setBlink] = useState(false)
  const [talkH, setTalkH] = useState<number | undefined>(undefined)
  const exprRef = useRef(expression)
  exprRef.current = expression

  // Piscada em intervalo irregular — intervalo fixo o olho identifica como máquina.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        if (exprRef.current !== "dormindo") {
          setBlink(true)
          setTimeout(() => setBlink(false), 120)
        }
        loop()
      }, 1900 + Math.random() * 3200)
    }
    loop()
    return () => clearTimeout(t)
  }, [])

  // Boca não existe, então "falar" é o olho pulsando no ritmo da fala.
  useEffect(() => {
    if (expression !== "falando") {
      setTalkH(undefined)
      return
    }
    let on = false
    const i = setInterval(() => {
      on = !on
      setTalkH(on ? 74 : 104)
    }, 170)
    return () => clearInterval(i)
  }, [expression])

  const spec = EXPRESSIONS[expression]

  return (
    <svg viewBox="0 0 320 210" className={className} width="100%" role="img" aria-label={`Pérola está ${expression}`}>
      <defs>
        <linearGradient id="perola-eye" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8CF2E7" />
          <stop offset="100%" stopColor="#3FC9BC" />
        </linearGradient>
        <filter id="perola-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        transform={spec.face || undefined}
        style={{ transition: "transform .4s cubic-bezier(.34,1.3,.64,1)" }}
      >
        <g transform="translate(105,105)">
          <Eye spec={spec} side={0} blink={blink} heightOverride={talkH} />
        </g>
        <g transform="translate(215,105)">
          <Eye spec={spec} side={1} blink={blink} heightOverride={talkH} />
        </g>
      </g>
    </svg>
  )
}

export const EXPRESSION_LIST = Object.keys(EXPRESSIONS) as Expression[]

import { timingSafeEqual } from "crypto"

/**
 * Portão de acesso das rotas da Pérola.
 *
 * Não é login de verdade — é um código único (PEROLA_ACCESS_CODE) que o
 * dispositivo guarda depois de digitado uma vez. Existe pra fechar as rotas
 * pra internet em geral quando isso sair de localhost pra um domínio
 * público de verdade. Sem PEROLA_ACCESS_CODE configurado, tudo é recusado —
 * falha fechada, não aberta.
 */

const HEADER = "x-perola-code"

export function codigoValido(request: Request): boolean {
  const esperado = process.env.PEROLA_ACCESS_CODE
  if (!esperado) return false

  const recebido = request.headers.get(HEADER)
  if (!recebido) return false

  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

export function respostaNaoAutorizada() {
  return Response.json({ error: "código de acesso inválido" }, { status: 401 })
}

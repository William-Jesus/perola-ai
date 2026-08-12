import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"

/**
 * Memória entre sessões da Pérola — fatos soltos sobre a criança
 * (nome de uma amiga, o que ela gosta, uma dificuldade recorrente).
 *
 * JSON em disco, mesmo padrão que o /api/jarvis/memory original usava,
 * só que sem toda a infra em volta. Projeto de uma família só, então
 * não precisa de banco — precisa não perder o arquivo.
 */

const MEMORIA_DIR = path.join(process.cwd(), "data")
const MEMORIA_PATH = path.join(MEMORIA_DIR, "memoria.json")

/** limite de fatos guardados — sem isso o prompt cresce pra sempre */
const MAX_FATOS = 30

interface Memoria {
  fatos: string[]
}

async function lerMemoria(): Promise<Memoria> {
  try {
    const raw = await readFile(MEMORIA_PATH, "utf-8")
    const data = JSON.parse(raw)
    return { fatos: Array.isArray(data.fatos) ? data.fatos : [] }
  } catch {
    return { fatos: [] }
  }
}

export async function getFatos(): Promise<string[]> {
  const { fatos } = await lerMemoria()
  return fatos
}

/** adiciona um fato novo, descartando os mais antigos além do limite */
export async function addFato(fato: string): Promise<string[]> {
  const { fatos } = await lerMemoria()
  const atualizado = [...fatos, fato].slice(-MAX_FATOS)

  await mkdir(MEMORIA_DIR, { recursive: true })
  await writeFile(MEMORIA_PATH, JSON.stringify({ fatos: atualizado }, null, 2))

  return atualizado
}

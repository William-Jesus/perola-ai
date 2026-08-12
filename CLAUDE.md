# Pérola

Assistente de IA para uma criança de 9 anos. Amiga e conselheira primeiro,
ajudante de dever depois. Conversa por voz, tem rosto na tela e enxerga pela câmera.

O projeto nasceu de um fork do `jarvis-ai-assistant` (assistente pessoal do William).
O histórico do git vem de lá; o remote `origin` foi removido de propósito.

---

## Regra número um

**A Pérola nunca dá a resposta do dever de casa.** Ela conduz com perguntas
até a criança chegar sozinha. Isso não é um detalhe de prompt — é o produto.
Qualquer mudança que facilite ela entregar a resposta está errada.

Exceções, ambas deliberadas:

1. **Na quarta tentativa do mesmo exercício**, ela explica o caminho completo
   passo a passo (nunca só o número) e pede pra criança refazer um parecido.
   Criança travada às 21h com sono não precisa de professor irredutível.
2. **Modo conferente**: se a criança fez a conta e diz o resultado, a Pérola
   resolve em silêncio, confere a própria conta duas vezes, e diz se bateu.
   Se errou, aponta o *passo* onde ela se perdeu — nunca o número certo.
   Nunca concorda só pra agradar.

## Segurança — não negociável

`app/api/perola/session/route.ts` expõe **duas** ferramentas: `mudar_expressao`
e `ver_camera`. Só isso.

O JARVIS original tinha `run_command`, `open_app`, `read_file`, `write_file`,
`list_directory`, `get_agents` e `ask_claude`. Tudo isso foi **removido do repo**,
não apenas desabilitado. Prompt se convence com jeitinho; ferramenta que não
existe, não.

Não adicione ferramenta nova sem pensar em quem está do outro lado da tela.

Os olhos (`app/api/perola/ver/route.ts`) têm instrução explícita de **transcrever
e nunca resolver**. Se a visão resolver o exercício, a Pérola recebe a resposta
pronta e o projeto inteiro perde o sentido.

---

## Arquitetura

Tudo em OpenAI. O Claude chegou a ser usado e foi removido — um provedor só,
uma chave, um lugar pra depurar.

| Peça | Onde | O quê |
|---|---|---|
| Cérebro + voz | `app/api/perola/session/route.ts` | Realtime `gpt-realtime-2`, voz `coral`, via WebRTC |
| Olhos | `app/api/perola/ver/route.ts` | `gpt-4o` vision, transcreve o exercício |
| Personalidade | `lib/perola/prompt.ts` | **É aqui que mora o produto** |
| Rosto | `components/perola/perola-face.tsx` | SVG, 9 expressões |
| Câmera | `components/perola/camera-feed.tsx` | herdado do JARVIS, intocado |
| Tela | `app/perola/page.tsx` | cliente WebRTC + rosto |

O WebRTC foi copiado do `jarvis-core.tsx` original, com uma diferença: lá o
`pc.ontrack` estava comentado porque usavam ElevenLabs. Aqui está ligado — a voz
vem pelo próprio canal, sem TTS separado.

### O rosto

Cada expressão é um conjunto de medidas em `EXPRESSIONS`. Pra criar uma nova,
adicione uma entrada — não precisa mexer em mais nada.

Dois detalhes que não são enfeite:
- A piscada tem intervalo **irregular** (1,9s a 5,1s). Intervalo fixo o cérebro
  lê como máquina.
- Os dois brilhos em cada olho. Sem eles, parece botão aceso; com eles, parece
  que tem alguém ali.

**A Pérola nunca fica `triste` porque a criança errou.** Erro vira `curiosa`.
Se o rosto entristece a cada erro, a criança aprende que errar decepciona alguém —
o oposto do que se quer numa ferramenta de estudo. `triste` é só pra quando *ela*
está triste e a Pérola está do lado.

A expressão vem por function calling: o modelo chama `mudar_expressao` antes de
falar. Durante o áudio o rosto vai pra `falando` e depois volta pra expressão
escolhida — senão fica com cara de falando parada no silêncio.

---

## Rodar

```bash
npm install
npm run dev   # http://localhost:3000/perola
```

`.env.local` precisa de `OPENAI_API_KEY`. Opcional: `PEROLA_VOICE` (padrão `coral`).

---

## Estado atual

Funciona: rosto com 9 expressões, conversa por voz, expressão dirigida pela IA,
câmera sob demanda, prompt socrático com limite de 4 tentativas.

### Pendências imediatas

1. `app/page.tsx` ainda importa `JarvisCore`, que foi deletado — **quebra o build**.
   Deve virar redirect pra `/perola` ou a própria Pérola.
2. `app/layout.tsx` ainda tem metadata do JARVIS (title, ícones).
3. `app/perola/page.tsx` importa a câmera de `@/components/jarvis/camera-feed`;
   o arquivo agora está em `@/components/perola/camera-feed`.
4. `package.json` tem ~30 dependências órfãs: `googleapis`, `@simplewebauthn/*`,
   `iron-session`, `playwright`, `@anthropic-ai/sdk`, quase todo o Radix.
5. `Dockerfile`, `docker-compose.yml` e `DEPLOY.md` ainda referenciam o JARVIS.
6. `README.md` é o do projeto original.

### Depois

- **Contar tentativas de verdade.** Hoje quem conta é o modelo, dentro da conversa.
  Detectar que é o *mesmo* exercício é mais difícil do que parece.
- **Memória entre sessões.** O JARVIS tinha `/api/jarvis/memory` (JSON em disco) —
  foi removido, mas o padrão serve de referência.
- **Visão de responsável.** Nenhum pai vai deixar a filha usar isso sem saber
  do que ela conversou.
- **Custo.** Realtime cobra por áudio, não por token de texto. Meia hora por dia
  soma rápido. Vale medir antes de virar rotina.

---

## Tom

Português do Brasil, como criança de 9 anos fala. Frases curtas — tudo vira voz.
Sem emoji, sem markdown, sem lista lida em voz alta.

Ela pode ser boba, rir, ter opinião e dizer que não sabe. Nunca "senhor",
"senhora" ou "posso ajudar em algo mais?".

Conversa fora do dever — curiosidade, medo, briga com amiga — não é distração.
É metade do motivo dela existir.

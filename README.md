# Pérola

Assistente de IA para uma criança de 9 anos. Amiga e conselheira primeiro, ajudante de dever depois. Conversa por voz, tem rosto na tela e enxerga pela câmera.

A regra número um: a Pérola nunca dá a resposta do dever de casa — ela conduz com perguntas até a criança chegar sozinha. Detalhes de personalidade, segurança e arquitetura estão em [`CLAUDE.md`](CLAUDE.md).

## Rodar

```bash
npm install
npm run dev   # http://localhost:3000/perola
```

`.env.local` precisa de `OPENAI_API_KEY`. Opcional: `PEROLA_VOICE` (padrão `coral`).

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Voz:** OpenAI Realtime (`gpt-realtime-2`) via WebRTC
- **Visão:** OpenAI `gpt-4o` (transcrição de exercícios, nunca resolução)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Linguagem:** TypeScript

## Deploy

Ver [`DEPLOY.md`](DEPLOY.md).

# Chat AI

ChatGPT-style web chat sederhana yang memakai [9Router](https://9router.com/) sebagai OpenAI-compatible gateway.

## Fitur

- UI chat responsif ala ChatGPT
- Streaming response
- Riwayat percakapan di \`localStorage\`
- New chat dan hapus chat
- Stop generation
- API key hanya dipakai di server
- Next.js App Router + TypeScript
- Tidak memakai SDK provider tambahan, request langsung ke endpoint OpenAI-compatible

## Menjalankan project

### 1. Clone dan install

\`\`\`bash
git clone https://github.com/allifiz/chat-ai.git
cd chat-ai
npm install
\`\`\`

### 2. Buat file environment

Copy contoh environment:

\`\`\`bash
cp .env.example .env.local
\`\`\`

Isi \`.env.local\`:

\`\`\`env
ROUTER_API_KEY=API_KEY_KAMU
ROUTER_BASE_URL=https://9router.com/v1
ROUTER_MODEL=MODEL_ID_KAMU
\`\`\`

Jangan commit \`.env.local\`. File tersebut sudah masuk \`.gitignore\`.

Untuk \`ROUTER_MODEL\`, pakai model ID yang tersedia di dashboard 9Router. Kamu juga bisa mengecek daftar model melalui endpoint OpenAI-compatible \`GET /v1/models\`.

### 3. Jalankan

\`\`\`bash
npm run dev
\`\`\`

Buka:

\`\`\`text
http://localhost:3000
\`\`\`

## Cara kerja

Browser tidak memanggil 9Router secara langsung.

\`\`\`text
Browser
  ↓
POST /api/chat
  ↓
Next.js server
  ↓
9Router /v1/chat/completions
  ↓
SSE stream
  ↓
Browser
\`\`\`

Dengan struktur ini, \`ROUTER_API_KEY\` tidak pernah dikirim ke browser.

## Environment variables

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| \`ROUTER_API_KEY\` | Ya | API key dari dashboard 9Router |
| \`ROUTER_MODEL\` | Ya | Model ID yang ingin dipakai |
| \`ROUTER_BASE_URL\` | Tidak | Default: \`https://9router.com/v1\` |

## Build production

\`\`\`bash
npm run typecheck
npm run build
npm start
\`\`\`

Untuk deploy ke Vercel, tambahkan tiga environment variable di atas melalui Project Settings > Environment Variables. Jangan menaruh API key sebagai variable yang diawali \`NEXT_PUBLIC_\`, karena variable seperti itu dapat diekspos ke browser.

## Next step yang masuk akal

Project ini sengaja dimulai sebagai MVP. Fitur berikutnya bisa berupa autentikasi, database untuk sinkronisasi history lintas perangkat, Markdown + syntax highlighting, upload file/gambar, pilihan model dari 9Router, rename chat, dan rate limiting.

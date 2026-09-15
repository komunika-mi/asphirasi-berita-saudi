// Autentikasi dari env: CLAUDE_CODE_OAUTH_TOKEN (langganan, pola sama dengan
// The Signal) atau ANTHROPIC_API_KEY.
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';

export const MODEL = process.env.ASPHIRASI_MODEL || 'claude-sonnet-5';

async function kumpulkanTeks(it) {
  let keluaran = '';
  for await (const pesan of it) {
    if (pesan.type === 'assistant') {
      for (const blok of pesan.message.content) {
        if (blok.type === 'text') keluaran += blok.text;
      }
    }
    if (pesan.type === 'result' && pesan.subtype !== 'success') {
      throw new Error(`Claude berhenti: ${pesan.subtype}`);
    }
  }
  return keluaran.trim();
}

export async function tanya(systemPrompt, userPrompt) {
  return kumpulkanTeks(
    query({
      prompt: userPrompt,
      options: {
        model: MODEL,
        systemPrompt,
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        maxTurns: 8,
      },
    }),
  );
}

// Pemeriksaan visual memakai tool Read, yang bisa membaca berkas gambar.
// Hanya Read yang diizinkan dan cwd dikunci ke folder gambarnya.
export async function lihatGambar(berkas, systemPrompt, userPrompt) {
  return kumpulkanTeks(
    query({
      prompt: `${userPrompt}\n\nBerkas gambar: ${path.basename(berkas)}`,
      options: {
        model: MODEL,
        systemPrompt,
        cwd: path.dirname(berkas),
        allowedTools: ['Read'],
        permissionMode: 'bypassPermissions',
        maxTurns: 8,
      },
    }),
  );
}

export function ambilJSON(teks) {
  let t = teks.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  const k = t.indexOf('['), l = t.lastIndexOf(']');
  if (k !== -1 && (i === -1 || k < i)) t = t.slice(k, l + 1);
  else if (i !== -1) t = t.slice(i, j + 1);
  return JSON.parse(t);
}

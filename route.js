import { supabaseServer } from "../../../lib/supabaseClient";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export async function POST(req) {
  const { projectId, videoUrl } = await req.json();
  const db = supabaseServer();

  try {
    await db.from("projects").update({ status: "transcribing" }).eq("id", projectId);

    // 1) Kirim video ke AssemblyAI untuk ditranskripsi
    const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: "POST",
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: videoUrl,
        language_code: "id", // Bahasa Indonesia
        punctuate: true,
        format_text: true,
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new Error(`AssemblyAI menolak permintaan: ${errText}`);
    }

    const { id: transcriptId } = await submitRes.json();

    // 2) Polling sampai transkripsi selesai (maksimal ~5 menit)
    let transcript = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
        headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
      });
      const pollData = await pollRes.json();

      if (pollData.status === "completed") {
        transcript = pollData;
        break;
      }
      if (pollData.status === "error") {
        throw new Error(`Transkripsi gagal: ${pollData.error}`);
      }
    }

    if (!transcript) {
      throw new Error("Transkripsi melebihi batas waktu tunggu.");
    }

    // transcript.words berisi array {text, start, end, confidence} dalam milidetik — INI wajib
    // disimpan utuh, karena jadi dasar potongan klip & subtitle yang akurat.
    await db
      .from("projects")
      .update({
        status: "transcribed",
        transcript: {
          full_text: transcript.text,
          words: transcript.words, // word-level timestamps asli
        },
      })
      .eq("id", projectId);

    return Response.json({ ok: true, wordCount: transcript.words?.length || 0 });
  } catch (err) {
    await db
      .from("projects")
      .update({ status: "error", render_error: String(err) })
      .eq("id", projectId);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

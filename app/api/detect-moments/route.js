import { supabaseServer } from "../../../lib/supabaseClient";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function sliceTranscript(words, startMs, endMs) {
  return words
    .filter((w) => w.start >= startMs && w.end <= endMs)
    .map((w) => w.text)
    .join(" ");
}

async function askGemini(prompt) {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini menolak permintaan: ${errText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function POST(req) {
  const { projectId } = await req.json();
  const db = supabaseServer();

  try {
    const { data: project } = await db
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (!project?.transcript?.words?.length) {
      throw new Error("Transkrip belum tersedia untuk proyek ini.");
    }

    const { words, full_text } = project.transcript;

    const candidatesRaw = await askGemini(
      `Berikut transkrip lengkap sebuah video (Bahasa Indonesia):\n\n"""${full_text}"""\n\nUsulkan 3-6 momen (durasi 20-90 detik) yang paling berpotensi viral untuk TikTok/Reels/Shorts. Balas HANYA JSON array, format: [{"start_hint": "kutipan kalimat awal momen", "end_hint": "kutipan kalimat akhir momen", "reason": "alasan singkat kenapa menarik"}]. Jangan tambahkan teks lain di luar JSON.`
    );
    const candidates = JSON.parse(candidatesRaw.replace(/```json|```/g, "").trim());

    const clipsToInsert = [];

    for (const c of candidates) {
      const startIdx = full_text.indexOf(c.start_hint);
      const endIdx = full_text.indexOf(c.end_hint) + (c.end_hint?.length || 0);
      if (startIdx === -1 || endIdx === -1) continue;

      const totalChars = full_text.length;
      const firstWordMs = words[0]?.start || 0;
      const lastWordMs = words[words.length - 1]?.end || 0;
      const totalMs = lastWordMs - firstWordMs;

      const startMs = firstWordMs + Math.floor((startIdx / totalChars) * totalMs);
      const endMs = firstWordMs + Math.floor((endIdx / totalChars) * totalMs);

      const clipTranscript = sliceTranscript(words, startMs, endMs);
      if (!clipTranscript) continue;

      const hookTitle = (
        await askGemini(
          `Ini transkrip PERSIS dari satu klip video (Bahasa Indonesia):\n\n"""${clipTranscript}"""\n\nBuat 1 judul/hook pendek (maks 12 kata) yang menarik untuk klip ini, HARUS berdasarkan isi transkrip di atas, jangan mengarang di luar konteksnya. Balas hanya teks judulnya saja.`
        )
      ).trim();

      clipsToInsert.push({
        project_id: projectId,
        start_ms: startMs,
        end_ms: endMs,
        clip_transcript: clipTranscript,
        hook_title: hookTitle,
        viral_reason: c.reason,
        render_status: "pending",
      });
    }

    if (clipsToInsert.length === 0) {
      throw new Error(
        "Tidak ada momen yang berhasil dipetakan ke timestamp. Coba video dengan transkrip lebih jelas."
      );
    }

    await db.from("clips").insert(clipsToInsert);
    await db.from("projects").update({ status: "moments_detected" }).eq("id", projectId);

    return Response.json({ ok: true, clipCount: clipsToInsert.length });
  } catch (err) {
    await db
      .from("projects")
      .update({ status: "error", render_error: String(err) })
      .eq("id", projectId);
    return Response.json({ error: String(err) }, { status: 500 });
  }
    }

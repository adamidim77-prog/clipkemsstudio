import { supabaseServer } from "../../../lib/supabaseClient";

// Ambil potongan kata-kata transcript yang berada di rentang [startMs, endMs].
// Inilah yang membuat hook/title dibuat dari transkrip ASLI klip itu, bukan tebakan LLM.
function sliceTranscript(words, startMs, endMs) {
  return words
    .filter((w) => w.start >= startMs && w.end <= endMs)
    .map((w) => w.text)
    .join(" ");
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

    // 1) Minta LLM mengusulkan kandidat momen viral (hanya timestamp + alasan, TANPA judul dulu)
    const candidatesRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Berikut transkrip lengkap sebuah video (Bahasa Indonesia):\n\n"""${full_text}"""\n\nUsulkan 3-6 momen (durasi 20-90 detik) yang paling berpotensi viral untuk TikTok/Reels/Shorts. Balas HANYA JSON array, format: [{"start_hint": "kutipan kalimat awal momen", "end_hint": "kutipan kalimat akhir momen", "reason": "alasan singkat kenapa menarik"}]. Jangan tambahkan teks lain di luar JSON.`,
          },
        ],
      }),
    });

    const candidatesData = await candidatesRes.json();
    const rawText = candidatesData.content?.[0]?.text || "[]";
    const candidates = JSON.parse(rawText.replace(/```json|```/g, "").trim());

    const clipsToInsert = [];

    for (const c of candidates) {
      // Cari posisi kutipan di dalam array kata untuk dapat timestamp asli
      const startWord = words.find((w) =>
        c.start_hint && full_text.includes(c.start_hint) ? true : false
      );
      // Pendekatan sederhana: cari index kata pertama & terakhir dari hint di full_text,
      // lalu petakan ke words[] berdasarkan urutan karakter. Untuk produksi, pertimbangkan
      // fuzzy matching yang lebih robust.
      const startIdx = full_text.indexOf(c.start_hint);
      const endIdx = full_text.indexOf(c.end_hint) + (c.end_hint?.length || 0);
      if (startIdx === -1 || endIdx === -1) continue;

      // Perkirakan timestamp berdasar proporsi posisi karakter terhadap durasi total kata
      const totalChars = full_text.length;
      const firstWordMs = words[0]?.start || 0;
      const lastWordMs = words[words.length - 1]?.end || 0;
      const totalMs = lastWordMs - firstWordMs;

      const startMs = firstWordMs + Math.floor((startIdx / totalChars) * totalMs);
      const endMs = firstWordMs + Math.floor((endIdx / totalChars) * totalMs);

      const clipTranscript = sliceTranscript(words, startMs, endMs);
      if (!clipTranscript) continue;

      // 2) Generate hook/title dari TEKS ASLI klip ini (bukan dari transkrip penuh)
      const hookRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: `Ini transkrip PERSIS dari satu klip video (Bahasa Indonesia):\n\n"""${clipTranscript}"""\n\nBuat 1 judul/hook pendek (maks 12 kata) yang menarik untuk klip ini, HARUS berdasarkan isi transkrip di atas, jangan mengarang di luar konteksnya. Balas hanya teks judulnya saja.`,
            },
          ],
        }),
      });
      const hookData = await hookRes.json();
      const hookTitle = hookData.content?.[0]?.text?.trim();

      clipsToInsert.push({
        project_id: projectId,
        start_ms: startMs,
        end_ms: endMs,
        clip_transcript: clipTranscript, // provenance — bukti hook dibuat dari transkrip asli
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

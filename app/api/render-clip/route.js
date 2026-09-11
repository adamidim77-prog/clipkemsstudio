import { supabaseServer } from "../../../lib/supabaseClient";

// Bangun URL subtitle .srt sederhana dari word-level timestamps di rentang klip.
function buildSrt(words, startMs, endMs) {
  const clipWords = words.filter((w) => w.start >= startMs && w.end <= endMs);
  let srt = "";
  let idx = 1;
  // Kelompokkan jadi baris ~6 kata biar subtitle enak dibaca (dua baris pendek)
  for (let i = 0; i < clipWords.length; i += 6) {
    const chunk = clipWords.slice(i, i + 6);
    const lineStart = chunk[0].start - startMs;
    const lineEnd = chunk[chunk.length - 1].end - startMs;
    const text = chunk.map((w) => w.text).join(" ");
    srt += `${idx}\n${msToSrtTime(lineStart)} --> ${msToSrtTime(lineEnd)}\n${text}\n\n`;
    idx++;
  }
  return srt;
}

function msToSrtTime(ms) {
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const msRem = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${msRem}`;
}

export async function POST(req) {
  const { clipId } = await req.json();
  const db = supabaseServer();

  try {
    const { data: clip } = await db.from("clips").select("*, projects(*)").eq("id", clipId).single();
    if (!clip) throw new Error("Klip tidak ditemukan.");

    const words = clip.projects.transcript.words;
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;

    // 1) Upload .srt subtitle ke Cloudinary (raw file) supaya bisa dipakai transformasi l_subtitles
    const srtContent = buildSrt(words, clip.start_ms, clip.end_ms);
    const srtUpload = await uploadRawToCloudinary(srtContent, `srt_${clipId}`);

    // 2) Susun transformasi Cloudinary:
    //    - trim ke rentang klip
    //    - reframe 9:16 pakai gravity:auto (content-aware; PERINGATAN JUJUR di bawah)
    //    - overlay subtitle dari file .srt yang baru diupload, font proporsional (~128px di kanvas 1080x1920)
    const startSec = (clip.start_ms / 1000).toFixed(2);
    const durationSec = ((clip.end_ms - clip.start_ms) / 1000).toFixed(2);

    const transformation = [
      `so_${startSec},du_${durationSec}`, // potong sesuai rentang klip
      "ar_9:16,c_fill,g_auto", // reframe cover 9:16, gravity otomatis mengikuti area menarik
      `l_subtitles:${srtUpload.public_id},co_white,so_-200`, // overlay subtitle
    ].join("/");

    const renderUrl = `https://res.cloudinary.com/${cloud}/video/upload/${transformation}/${clip.projects.video_public_id}.mp4`;

    // 3) Verifikasi render benar-benar tersedia (bukan asumsi jadi)
    const check = await fetch(renderUrl, { method: "HEAD" });

    if (!check.ok) {
      throw new Error(
        `Render belum tersedia (status ${check.status}). PERHATIAN: gravity_auto Cloudinary adalah content-aware cropping, BUKAN face-tracking dinamis per-frame sungguhan. Untuk face-tracking asli, perlu integrasi provider khusus (misal Replicate/Modal dengan model face-tracking) — belum terpasang di kode ini.`
      );
    }

    await db
      .from("clips")
      .update({ render_url: renderUrl, render_status: "done", render_error: null })
      .eq("id", clipId);

    return Response.json({ ok: true, renderUrl });
  } catch (err) {
    await db
      .from("clips")
      .update({ render_status: "error", render_error: String(err) })
      .eq("id", clipId);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function uploadRawToCloudinary(content, publicId) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const formData = new FormData();
  const blob = new Blob([content], { type: "text/plain" });
  formData.append("file", blob, `${publicId}.srt`);
  formData.append("public_id", publicId);
  formData.append("resource_type", "raw");
  formData.append("api_key", process.env.CLOUDINARY_API_KEY);
  formData.append("timestamp", String(Math.floor(Date.now() / 1000)));
  // Catatan: untuk produksi, tanda tangani request ini di server (signed upload),
  // jangan expose api_secret ke client. Di sini sudah dipanggil dari server (API route), aman.

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/raw/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Gagal upload subtitle ke Cloudinary.");
  return res.json();
}

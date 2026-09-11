// Hanya mengambil metadata resmi (judul, thumbnail, channel) lewat YouTube oEmbed API.
// TIDAK mengunduh video — itu melanggar Ketentuan Layanan YouTube.
// Video tetap harus di-upload manual oleh pengguna di langkah berikutnya.

export async function POST(req) {
  try {
    const { youtubeUrl } = await req.json();
    if (!youtubeUrl) {
      return Response.json({ error: "Link YouTube kosong." }, { status: 400 });
    }

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      youtubeUrl
    )}&format=json`;

    const res = await fetch(oembedUrl);
    if (!res.ok) {
      return Response.json(
        { error: "Link YouTube tidak valid atau video privat/tidak ditemukan." },
        { status: 422 }
      );
    }

    const data = await res.json();

    return Response.json({
      title: data.title,
      author: data.author_name,
      thumbnail: data.thumbnail_url,
      note: "Ini hanya pratinjau. Silakan upload file video ini secara manual untuk diproses.",
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

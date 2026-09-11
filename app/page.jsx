"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabaseClient";

export default function Home() {
  const [session, setSession] = useState(null);
  const [projects, setProjects] = useState([]);
  const [youtubePreview, setYoutubePreview] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadProjects();
  }, [session]);

  async function loadProjects() {
    const { data } = await supabaseBrowser
      .from("projects")
      .select("*, clips(*)")
      .order("created_at", { ascending: false });
    setProjects(data || []);
  }

  async function handleYoutubePreview() {
    setError("");
    const res = await fetch("/api/youtube-preview", {
      method: "POST",
      body: JSON.stringify({ youtubeUrl }),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);
    setYoutubePreview(data);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const path = `${session.user.id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabaseBrowser.storage
        .from("videos")
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabaseBrowser.storage.from("videos").getPublicUrl(path);

      const { data: project, error: insertErr } = await supabaseBrowser
        .from("projects")
        .insert({
          user_id: session.user.id,
          title: youtubePreview?.title || file.name,
          source_type: youtubePreview ? "youtube_preview" : "upload",
          video_url: urlData.publicUrl,
          status: "uploaded",
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      // Mulai proses transkripsi otomatis di background
      fetch("/api/transcribe", {
        method: "POST",
        body: JSON.stringify({ projectId: project.id, videoUrl: urlData.publicUrl }),
      });

      setYoutubePreview(null);
      setYoutubeUrl("");
      loadProjects();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDetectMoments(projectId) {
    await fetch("/api/detect-moments", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
    loadProjects();
  }

  async function handleRenderClip(clipId) {
    await fetch("/api/render-clip", {
      method: "POST",
      body: JSON.stringify({ clipId }),
    });
    loadProjects();
  }

  if (!session) return <LoginForm />;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>ClipStudio</h1>
      <p>Ubah video panjang jadi klip pendek berpotensi viral.</p>

      <section style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <h3>1. Tempel link YouTube (opsional — hanya pratinjau)</h3>
        <input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtu.be/..."
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <button onClick={handleYoutubePreview}>Lihat Pratinjau</button>

        {youtubePreview && (
          <div style={{ marginTop: 12 }}>
            <img src={youtubePreview.thumbnail} alt="" style={{ width: "100%", borderRadius: 8 }} />
            <p><strong>{youtubePreview.title}</strong> — {youtubePreview.author}</p>
            <p style={{ fontSize: 13, opacity: 0.8 }}>{youtubePreview.note}</p>
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>2. Upload file video</h3>
        <input type="file" accept="video/*" onChange={handleUpload} disabled={uploading} />
        {uploading && <p>Mengunggah...</p>}
        {error && <p style={{ color: "salmon" }}>{error}</p>}
      </section>

      <h2>Proyek Saya</h2>
      {projects.map((p) => (
        <div key={p.id} style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <strong>{p.title}</strong>
          <p>Status: {p.status} {p.render_error && `— ${p.render_error}`}</p>

          {p.status === "transcribed" && (
            <button onClick={() => handleDetectMoments(p.id)}>Deteksi Momen Viral</button>
          )}

          {p.clips?.map((c) => (
            <div key={c.id} style={{ borderTop: "1px solid #333", marginTop: 8, paddingTop: 8 }}>
              <p><strong>{c.hook_title}</strong></p>
              <p style={{ fontSize: 12, opacity: 0.7 }}>{c.viral_reason}</p>
              <p style={{ fontSize: 12 }}>Status render: {c.render_status} {c.render_error && `— ${c.render_error}`}</p>
              {c.render_status === "pending" && (
                <button onClick={() => handleRenderClip(c.id)}>Render Klip</button>
              )}
              {c.render_url && (
                <video src={c.render_url} controls style={{ width: "100%", marginTop: 8 }} />
              )}
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const fn = mode === "login" ? "signInWithPassword" : "signUp";
    const { error } = await supabaseBrowser.auth[fn]({ email, password });
    if (error) setError(error.message);
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>ClipStudio</h1>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
      {error && <p style={{ color: "salmon" }}>{error}</p>}
      <button onClick={submit} style={{ width: "100%", padding: 10 }}>
        {mode === "login" ? "Masuk" : "Daftar"}
      </button>
      <p onClick={() => setMode(mode === "login" ? "signup" : "login")} style={{ cursor: "pointer", marginTop: 8 }}>
        {mode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
      </p>
    </main>
  );
}

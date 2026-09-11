export const metadata = {
  title: "ClipStudio",
  description: "Ubah video panjang jadi klip pendek berpotensi viral",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body style={{ background: "#0a0a0a", color: "#fff", margin: 0 }}>{children}</body>
    </html>
  );
}

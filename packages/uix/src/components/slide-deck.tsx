/** Embed a built Slidev presentation. Slidev owns slide navigation and keyboard controls. */
export function SlideDeck({ src, title }: { src: string; title: string }) {
  return <iframe src={src} title={title} className="h-full min-h-0 w-full border-0"
    allow="fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
}

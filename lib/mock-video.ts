export function demoVideoUrl(sceneIndex?: number) {
  const videos = [
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    "https://media.w3.org/2010/05/sintel/trailer.mp4",
    "https://media.w3.org/2010/05/bunny/trailer.mp4"
  ];
  if (!sceneIndex) return videos[0];
  return videos[(sceneIndex - 1) % videos.length];
}

export function demoThumbnailUrl() {
  return "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=1200&auto=format&fit=crop";
}

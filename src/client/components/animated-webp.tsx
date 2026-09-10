import { useEffect, useState } from "react";

const assets = new Map<string, Promise<Blob>>();

export function preloadWebp(src: string) {
  let asset = assets.get(src);
  if (!asset) {
    asset = fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${src}.`);
        return response.blob();
      })
      .catch((error: unknown) => {
        assets.delete(src);
        throw error;
      });
    assets.set(src, asset);
  }
  return asset;
}

export function AnimatedWebp({ src, poster }: { src: string; poster: string }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    void preloadWebp(src)
      .then((blob) => {
        if (disposed) return;
        // A fresh URL restarts the cached animation on each mount.
        url = URL.createObjectURL(blob);
        setSource(url);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);
  return (
    <img
      src={source ?? poster}
      alt=""
      className="emote-motion size-full object-contain"
      draggable={false}
    />
  );
}

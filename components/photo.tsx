"use client";
import { useEffect, useState } from "react";
export function Photo({
  bytes,
  mime = "image/jpeg",
  alt,
  className,
  onClick,
}: {
  bytes?: Uint8Array;
  mime?: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!bytes) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: mime }),
    );
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes, mime]);
  if (!url)
    return (
      <div className={"photo-empty " + (className || "")}>
        Photo not selected
      </div>
    );
  const image = <img className={className} src={url} alt={alt} />;
  return onClick ? (
    <button
      className="photo-button"
      onClick={onClick}
      aria-label={`Enlarge: ${alt}`}
    >
      {image}
    </button>
  ) : (
    image
  );
}

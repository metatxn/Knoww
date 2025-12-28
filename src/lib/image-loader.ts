import type { ImageLoaderProps } from "next/image";

const normalizeSrc = (src: string) => {
  return src.startsWith("/") ? src.slice(1) : src;
};

export default function cloudflareLoader({
  src,
  width,
  quality,
}: ImageLoaderProps) {
  // If it's a relative path to public assets or doesn't need optimization
  if (!src.startsWith("http") && !src.startsWith("/")) {
    return src;
  }

  const params = [`width=${width}`];
  if (quality) {
    params.push(`quality=${quality}`);
  }
  params.push("format=auto");

  // Serve the original image when using `next dev`
  if (process.env.NODE_ENV === "development") {
    return src;
  }

  // Use Cloudflare Image Resizing
  return `/cdn-cgi/image/${params.join(",")}/${normalizeSrc(src)}`;
}

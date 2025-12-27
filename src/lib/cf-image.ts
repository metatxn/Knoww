export function cfImage(
  src: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: "auto" | "webp" | "avif";
  }
) {
  const params = new URLSearchParams();

  if (options?.width) params.set("width", String(options.width));
  if (options?.height) params.set("height", String(options.height));
  if (options?.quality) params.set("quality", String(options.quality));
  if (options?.format) params.set("format", options.format);

  return `https://knoww.app/cdn-cgi/image/${params.toString()}/${src}`;
}

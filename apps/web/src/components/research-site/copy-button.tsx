"use client";

import { useState } from "react";

export function CopyButton({
  targetId,
  text,
  label = "Copy",
}: {
  targetId?: string;
  text?: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  async function copy() {
    const value =
      text ?? (targetId ? document.getElementById(targetId)?.textContent : "");
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied.");
    } catch {
      setStatus("Copy unavailable. Select the text and copy it manually.");
    }
  }
  return (
    <span className="copy-control">
      <button className="btn btn-primary btn-sm" type="button" onClick={copy}>
        {label}
      </button>
      <span className="status" role="status">
        {status}
      </span>
    </span>
  );
}

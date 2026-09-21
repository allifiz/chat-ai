"use client";

import { type ReactNode, useState } from "react";

type CodeBlockProps = {
  code: string;
  language?: string;
  children: ReactNode;
};

export function CodeBlock({
  code,
  language = "code",
  children,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="code-block-shell">
      <div className="code-block-header">
        <span>{language}</span>
        <button type="button" onClick={handleCopy}>
          {copied ? "Disalin" : "Salin"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

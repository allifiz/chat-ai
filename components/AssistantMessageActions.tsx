"use client";

import { useMemo, useState } from "react";

function extractCodeBlocks(markdown: string) {
  const blocks: string[] = [];
  const regex = /\x60{3}[^\n]*\n([\s\S]*?)\x60{3}/g;
  let match: RegExpExecArray | null = regex.exec(markdown);

  while (match) {
    blocks.push(match[1].replace(/\n$/, ""));
    match = regex.exec(markdown);
  }

  return blocks;
}

export function AssistantMessageActions({ content }: { content: string }) {
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const codeBlocks = useMemo(() => extractCodeBlocks(content), [content]);

  async function copyText(value: string, type: "answer" | "code") {
    await navigator.clipboard.writeText(value);

    if (type === "answer") {
      setCopiedAnswer(true);
      window.setTimeout(() => setCopiedAnswer(false), 1400);
    } else {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1400);
    }
  }

  return (
    <div className="message-actions">
      <button
        type="button"
        onClick={() => void copyText(content, "answer")}
      >
        {copiedAnswer ? "Disalin" : "Salin jawaban"}
      </button>

      {codeBlocks.length > 0 ? (
        <button
          type="button"
          onClick={() =>
            void copyText(codeBlocks.join("\n\n"), "code")
          }
        >
          {copiedCode
            ? "Semua kode disalin"
            : codeBlocks.length === 1
              ? "Salin semua kode"
              : "Salin semua kode (" + codeBlocks.length + ")"}
        </button>
      ) : null}
    </div>
  );
}

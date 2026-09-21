"use client";

type AttachmentChipProps = {
  name: string;
  size: number;
  onRemove?: () => void;
  compact?: boolean;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function AttachmentChip({
  name,
  size,
  onRemove,
  compact = false,
}: AttachmentChipProps) {
  const extension = name.includes(".")
    ? name.split(".").pop()?.slice(0, 5).toUpperCase()
    : "FILE";

  return (
    <div className={"attachment-chip " + (compact ? "compact" : "")}>
      <div className="attachment-icon">{extension || "FILE"}</div>
      <div className="attachment-meta">
        <strong title={name}>{name}</strong>
        <span>{formatBytes(size)}</span>
      </div>

      {onRemove ? (
        <button
          type="button"
          className="attachment-remove"
          aria-label={"Hapus " + name}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

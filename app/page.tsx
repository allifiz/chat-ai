"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AssistantMessageActions } from "@/components/AssistantMessageActions";
import { AttachmentChip } from "@/components/AttachmentChip";
import { MarkdownMessage } from "@/components/MarkdownMessage";

const STORAGE_KEY = "chat-ai-conversations-v2";
const MODEL_STORAGE_KEY = "chat-ai-model-v1";
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 120_000;

type Role = "user" | "assistant";

type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
};

type Message = {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
};

type Chat = {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function createChat(): Chat {
  return {
    id: createId(),
    title: "Chat baru",
    createdAt: Date.now(),
    messages: [],
  };
}

function titleFromMessage(content: string, attachments: Attachment[]) {
  const compact = content.replace(/\s+/g, " ").trim();

  if (!compact) {
    return attachments[0]?.name ?? "Chat baru";
  }

  if (compact.length <= 38) return compact;

  return compact.slice(0, 38) + "…";
}

function buildApiContent(message: Message) {
  const parts: string[] = [];

  if (message.content.trim()) {
    parts.push(message.content.trim());
  }

  for (const attachment of message.attachments ?? []) {
    const safeName = attachment.name.replace(/"/g, "'");
    parts.push(
      [
        '<file name="' + safeName + '" type="' + attachment.mimeType + '">',
        attachment.content,
        "</file>",
      ].join("\n"),
    );
  }

  return parts.join("\n\n");
}


function codeLanguageFromFilename(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    json: "json",
    sql: "sql",
    py: "python",
    go: "go",
    cs: "csharp",
    php: "php",
    html: "html",
    css: "css",
    md: "markdown",
    sh: "bash",
    bash: "bash",
    yml: "yaml",
    yaml: "yaml",
    xml: "xml",
  };

  return languageMap[extension] ?? extension ?? "text";
}

function normalizeAssistantContent(content: string) {
  if (!content) return content;

  const fence = String.fromCharCode(96).repeat(3);

  let normalized = content.replace(
    /<write_to_file>\s*<path>\s*([\s\S]*?)\s*<\/path>\s*<content>\s*([\s\S]*?)\s*<\/content>\s*<\/write_to_file>/gi,
    (_match, rawPath: string, rawContent: string) => {
      const filename = rawPath.trim();
      const language = codeLanguageFromFilename(filename);
      const code = rawContent.trim();

      return (
        "File " +
        String.fromCharCode(96) +
        filename +
        String.fromCharCode(96) +
        ":\n\n" +
        fence +
        language +
        "\n" +
        code +
        "\n" +
        fence
      );
    },
  );

  normalized = normalized
    .replace(/<\/?write_to_file>/gi, "")
    .replace(/<\/?path>/gi, "")
    .replace(/<\/?content>/gi, "")
    .replace(/<\/?tool_call[^>]*>/gi, "")
    .trim();

  return normalized;
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem("chat-ai-conversations-v1");

      if (stored) {
        const parsed = JSON.parse(stored) as unknown;

        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored = parsed as Chat[];
          setChats(restored);
          setActiveChatId(restored[0].id);
          setHydrated(true);
          return;
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    const firstChat = createChat();
    setChats([firstChat]);
    setActiveChatId(firstChat.id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch {
      setError(
        "Riwayat browser sudah terlalu besar. Hapus beberapa chat atau attachment lama.",
      );
    }
  }, [chats, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    async function loadModels() {
      setModelsLoading(true);

      try {
        const response = await fetch("/api/models", { cache: "no-store" });
        const raw = await response.text();

        let payload: {
          data?: string[];
          defaultModel?: string | null;
          error?: string;
        } = {};

        try {
          payload = JSON.parse(raw) as typeof payload;
        } catch {
          // Response bukan JSON.
        }

        if (!response.ok) {
          throw new Error(
            payload.error || raw || "Gagal mengambil daftar model.",
          );
        }

        const availableModels = Array.isArray(payload.data) ? payload.data : [];

        if (cancelled) return;

        setModels(availableModels);

        const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
        const preferredModel =
          savedModel && availableModels.includes(savedModel)
            ? savedModel
            : payload.defaultModel &&
                availableModels.includes(payload.defaultModel)
              ? payload.defaultModel
              : availableModels[0] ?? payload.defaultModel ?? "";

        setSelectedModel(preferredModel);
      } catch (modelError) {
        if (cancelled) return;

        setError(
          modelError instanceof Error
            ? modelError.message
            : "Gagal mengambil daftar model.",
        );
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    }

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !selectedModel) return;

    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [hydrated, selectedModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, isStreaming]);

  function updateChat(chatId: string, updater: (chat: Chat) => Chat) {
    setChats((current) =>
      current.map((chat) => (chat.id === chatId ? updater(chat) : chat)),
    );
  }

  function resetComposerHeight() {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
  }

  function resizeComposer() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 360) + "px";
  }

  function handleNewChat() {
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }

    const nextChat = createChat();
    setChats((current) => [nextChat, ...current]);
    setActiveChatId(nextChat.id);
    setInput("");
    setPendingAttachments([]);
    setError("");
    setSidebarOpen(false);

    requestAnimationFrame(() => {
      resetComposerHeight();
      textareaRef.current?.focus();
    });
  }

  function handleDeleteChat(chatId: string) {
    if (isStreaming && chatId === activeChatId) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }

    setChats((current) => {
      const remaining = current.filter((chat) => chat.id !== chatId);

      if (remaining.length > 0) {
        if (chatId === activeChatId) {
          setActiveChatId(remaining[0].id);
        }
        return remaining;
      }

      const replacement = createChat();
      setActiveChatId(replacement.id);
      return [replacement];
    });
  }

  function addTextAttachment(content: string, name?: string, mimeType = "text/plain") {
    const size = new TextEncoder().encode(content).length;

    if (size > MAX_ATTACHMENT_BYTES) {
      setError(
        "Attachment terlalu besar. Maksimal sekitar 120 KB per file agar history browser dan token API tidak meledak.",
      );
      return;
    }

    setPendingAttachments((current) => {
      if (current.length >= MAX_ATTACHMENTS) {
        setError("Maksimal 4 attachment per pesan.");
        return current;
      }

      const fileName =
        name ?? "attachment-" + String(current.length + 1).padStart(2, "0") + ".txt";

      return [
        ...current,
        {
          id: createId(),
          name: fileName,
          mimeType,
          size,
          content,
        },
      ];
    });

    setError("");
  }

  async function addFiles(files: File[]) {
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(file.name + " terlalu besar. Maksimal sekitar 120 KB.");
        continue;
      }

      try {
        const content = await file.text();
        addTextAttachment(
          content,
          file.name,
          file.type || "text/plain",
        );
      } catch {
        setError("Gagal membaca " + file.name + " sebagai file teks.");
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      void addFiles(files);
    }

    event.target.value = "";
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();

    const content = input.trim();
    const chat = activeChat;
    const attachments = pendingAttachments;

    if ((!content && attachments.length === 0) || !chat || isStreaming) return;

    if (!selectedModel) {
      setError("Pilih model 9Router dulu.");
      return;
    }

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content,
      attachments,
    };

    const assistantMessage: Message = {
      id: createId(),
      role: "assistant",
      content: "",
    };

    const messagesForApi = [...chat.messages, userMessage].map((message) => ({
      role: message.role,
      content: buildApiContent(message),
    }));

    updateChat(chat.id, (current) => ({
      ...current,
      title:
        current.messages.length === 0
          ? titleFromMessage(content, attachments)
          : current.title,
      messages: [...current.messages, userMessage, assistantMessage],
    }));

    setInput("");
    setPendingAttachments([]);
    setError("");
    setIsStreaming(true);
    resetComposerHeight();

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messagesForApi,
          model: selectedModel,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = "Request gagal.";

        try {
          const body = (await response.json()) as { error?: string };
          message = body.error ?? message;
        } catch {
          message = await response.text();
        }

        throw new Error(message || "Request gagal.");
      }

      if (!response.body) {
        throw new Error("Response stream kosong.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
          stream: !done,
        });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();

          if (!line.startsWith("data:")) continue;

          const payload = line.slice(5).trim();

          if (!payload || payload === "[DONE]") continue;

          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string | null;
                };
              }>;
            };

            const delta = json.choices?.[0]?.delta?.content;

            if (!delta) continue;

            accumulated += delta;

            updateChat(chat.id, (current) => ({
              ...current,
              messages: current.messages.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: accumulated }
                  : message,
              ),
            }));
          } catch {
            // Abaikan event SSE non-JSON dari provider.
          }
        }
      }

      if (!accumulated) {
        updateChat(chat.id, (current) => ({
          ...current,
          messages: current.messages.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: "Model tidak mengembalikan teks.",
                }
              : message,
          ),
        }));
      } else {
        const normalizedContent = normalizeAssistantContent(accumulated);

        if (normalizedContent !== accumulated) {
          updateChat(chat.id, (current) => ({
            ...current,
            messages: current.messages.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: normalizedContent }
                : message,
            ),
          }));
        }
      }
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        if (!accumulated) {
          updateChat(chat.id, (current) => ({
            ...current,
            messages: current.messages.filter(
              (message) => message.id !== assistantMessage.id,
            ),
          }));
        }
        return;
      }

      const message =
        requestError instanceof Error
          ? requestError.message
          : "Terjadi error yang tidak diketahui.";

      setError(message);

      updateChat(chat.id, (current) => ({
        ...current,
        messages: current.messages.filter(
          (item) => item.id !== assistantMessage.id || Boolean(item.content),
        ),
      }));
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;

    const textarea = event.currentTarget;
    const cursorPosition = textarea.selectionStart;
    const beforeCursor = textarea.value.slice(0, cursorPosition);
    const fenceCount = beforeCursor.split("```").length - 1;
    const isInsideCodeFence = fenceCount % 2 === 1;

    if (isInsideCodeFence) {
      requestAnimationFrame(resizeComposer);
      return;
    }

    event.preventDefault();
    void handleSubmit();
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function useSuggestion(suggestion: string) {
    setInput(suggestion);
    setError("");

    requestAnimationFrame(() => {
      resizeComposer();
      textareaRef.current?.focus();
    });
  }

  if (!hydrated || !activeChat) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">AI</div>
        <span>Menyiapkan chat…</span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div
        className={"sidebar-backdrop " + (sidebarOpen ? "visible" : "")}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={"sidebar " + (sidebarOpen ? "open" : "")}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark">AI</div>
            <div>
              <strong>Chat AI</strong>
              <span>via 9Router</span>
            </div>
          </div>

          <button
            className="icon-button mobile-only"
            type="button"
            aria-label="Tutup sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <button className="new-chat-button" type="button" onClick={handleNewChat}>
          <span className="plus">+</span>
          Chat baru
        </button>

        <div className="history-label">Percakapan</div>

        <nav className="chat-history" aria-label="Riwayat percakapan">
          {chats.map((chat) => (
            <div
              className={
                "history-row " + (chat.id === activeChatId ? "active" : "")
              }
              key={chat.id}
            >
              <button
                className="history-item"
                type="button"
                onClick={() => {
                  setActiveChatId(chat.id);
                  setError("");
                  setSidebarOpen(false);
                }}
              >
                <span className="history-icon">◌</span>
                <span className="history-title">{chat.title}</span>
              </button>

              <button
                className="delete-chat"
                type="button"
                aria-label={"Hapus " + chat.title}
                onClick={() => handleDeleteChat(chat.id)}
              >
                ×
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          API key disimpan di server
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label="Buka sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="topbar-title">
            <strong>{activeChat.title}</strong>
            <span>Powered by 9Router</span>
          </div>

          <div className="topbar-actions">
            <select
              className="model-select"
              value={selectedModel}
              disabled={modelsLoading || models.length === 0}
              aria-label="Pilih model AI"
              onChange={(event) => {
                setSelectedModel(event.target.value);
                setError("");
              }}
            >
              {modelsLoading ? (
                <option value="">Memuat model…</option>
              ) : models.length === 0 ? (
                <option value="">Model tidak tersedia</option>
              ) : (
                models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              )}
            </select>

            <button className="topbar-new" type="button" onClick={handleNewChat}>
              + <span>Chat baru</span>
            </button>
          </div>
        </header>

        <div className="messages">
          {activeChat.messages.length === 0 ? (
            <section className="empty-state">
              <div className="hero-mark">AI</div>
              <h1>Apa yang mau kita kerjain?</h1>
              <p>
                Markdown, code block, tabel, attachment teks, dan streaming
                response sekarang sudah dirender seperti chat AI modern.
              </p>

              <div className="suggestions">
                {[
                  "Jelasin kode backend ini dengan bahasa sederhana",
                  "Bantu debug error yang lagi aku dapat",
                  "Bikin query PostgreSQL dari kebutuhan ini",
                  "Review struktur API endpoint-ku",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => useSuggestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="message-list">
              {activeChat.messages.map((message, index) => {
                const isLastStreamingAssistant =
                  isStreaming &&
                  index === activeChat.messages.length - 1 &&
                  message.role === "assistant";

                return (
                  <article
                    className={"message " + message.role}
                    key={message.id}
                  >
                    <div className="avatar">
                      {message.role === "user" ? "U" : "AI"}
                    </div>

                    <div className="message-content">
                      <div className="message-author">
                        {message.role === "user" ? "Kamu" : "Chat AI"}
                      </div>

                      {message.attachments?.length ? (
                        <div className="message-attachments">
                          {message.attachments.map((attachment) => (
                            <AttachmentChip
                              key={attachment.id}
                              name={attachment.name}
                              size={attachment.size}
                              compact
                            />
                          ))}
                        </div>
                      ) : null}

                      {message.content ? (
                        message.role === "assistant" ? (
                          /<write_to_file>|<content>|<path>/i.test(
                            message.content,
                          ) &&
                          !/<\/write_to_file>/i.test(message.content) &&
                          isLastStreamingAssistant ? (
                            <div
                              className="typing"
                              aria-label="AI sedang menyiapkan kode"
                            >
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : (
                            <>
                              <MarkdownMessage
                                content={
                                  isLastStreamingAssistant
                                    ? message.content
                                    : normalizeAssistantContent(message.content)
                                }
                              />
                              {!isLastStreamingAssistant ? (
                                <AssistantMessageActions
                                  content={normalizeAssistantContent(
                                    message.content,
                                  )}
                                />
                              ) : null}
                            </>
                          )
                        ) : (
                          <div className="user-message-text">
                            {message.content}
                          </div>
                        )
                      ) : (
                        <div
                          className="typing"
                          aria-label="AI sedang menjawab"
                        >
                          <span />
                          <span />
                          <span />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="composer-area">
          {error ? <div className="error-banner">{error}</div> : null}

          <div className="composer-box">
            {pendingAttachments.length > 0 ? (
              <div className="pending-attachments">
                {pendingAttachments.map((attachment) => (
                  <AttachmentChip
                    key={attachment.id}
                    name={attachment.name}
                    size={attachment.size}
                    onRemove={() =>
                      setPendingAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                  />
                ))}
              </div>
            ) : null}

            <form className="composer" onSubmit={handleSubmit}>
              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                multiple
                accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.sql,.py,.go,.cs,.php,.html,.css,.xml,.yaml,.yml,.env,.log,text/*,application/json"
                onChange={handleFileChange}
              />

              <button
                className="attach-button"
                type="button"
                aria-label="Lampirkan file teks"
                disabled={isStreaming}
                onClick={() => fileInputRef.current?.click()}
              >
                +
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                placeholder="Ketik pesan, paste source code, atau gunakan ```code```…"
                aria-label="Pesan"
                disabled={isStreaming}
                onChange={(event) => {
                  setInput(event.target.value);
                  resizeComposer();
                }}
                onKeyDown={handleKeyDown}
              />

              {isStreaming ? (
                <button
                  className="send-button stop"
                  type="button"
                  aria-label="Hentikan jawaban"
                  onClick={stopStreaming}
                >
                  ■
                </button>
              ) : (
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Kirim pesan"
                  disabled={
                    (!input.trim() && pendingAttachments.length === 0) ||
                    !selectedModel ||
                    modelsLoading
                  }
                >
                  ↑
                </button>
              )}
            </form>
          </div>

          <p className="composer-note">
            Markdown dan ```code block``` didukung. Enter kirim, Shift + Enter
            baris baru. Saat berada di dalam code block, Enter membuat baris baru.
          </p>
        </div>
      </section>
    </main>
  );
}

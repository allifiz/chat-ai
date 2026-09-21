"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const STORAGE_KEY = "chat-ai-conversations-v1";
const MODEL_STORAGE_KEY = "chat-ai-model-v1";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
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

function titleFromMessage(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();

  if (compact.length <= 38) return compact;

  return compact.slice(0, 38) + "…";
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    async function loadModels() {
      setModelsLoading(true);

      try {
        const response = await fetch("/api/models", { cache: "no-store" });
        const raw = await response.text();

        let payload: { data?: string[]; defaultModel?: string | null; error?: string } = {};

        try {
          payload = JSON.parse(raw) as typeof payload;
        } catch {
          // Response bukan JSON.
        }

        if (!response.ok) {
          throw new Error(payload.error || raw || "Gagal mengambil daftar model.");
        }

        const availableModels = Array.isArray(payload.data) ? payload.data : [];

        if (cancelled) return;

        setModels(availableModels);

        const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
        const preferredModel =
          savedModel && availableModels.includes(savedModel)
            ? savedModel
            : payload.defaultModel && availableModels.includes(payload.defaultModel)
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
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + "px";
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

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();

    const content = input.trim();
    const chat = activeChat;

    if (!content || !chat || isStreaming) return;

    if (!selectedModel) {
      setError("Pilih model 9Router dulu.");
      return;
    }

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content,
    };

    const assistantMessage: Message = {
      id: createId(),
      role: "assistant",
      content: "",
    };

    const messagesForApi = [...chat.messages, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }));

    updateChat(chat.id, (current) => ({
      ...current,
      title:
        current.messages.length === 0
          ? titleFromMessage(content)
          : current.title,
      messages: [...current.messages, userMessage, assistantMessage],
    }));

    setInput("");
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
        body: JSON.stringify({ messages: messagesForApi, model: selectedModel }),
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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
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
                Tanya apa saja. Jawaban akan di-stream dari model yang kamu
                pasang di 9Router.
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
              {activeChat.messages.map((message) => (
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

                    {message.content ? (
                      <div className="message-text">{message.content}</div>
                    ) : (
                      <div className="typing" aria-label="AI sedang menjawab">
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="composer-area">
          {error ? <div className="error-banner">{error}</div> : null}

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              placeholder="Ketik pesan…"
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
                disabled={!input.trim() || !selectedModel || modelsLoading}
              >
                ↑
              </button>
            )}
          </form>

          <p className="composer-note">
            Enter untuk kirim, Shift + Enter untuk baris baru. Riwayat tersimpan
            lokal di browser.
          </p>
        </div>
      </section>
    </main>
  );
}

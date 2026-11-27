import type { ProviderAdapter, ProviderId, StreamCallbacks, StreamChatOptions } from "../types";
import { tGlobal } from "../../../i18n";

export class OpenAiCompatibleAdapter implements ProviderAdapter {
  constructor(readonly providerId: ProviderId, readonly defaultEndpoint?: string) {}

  streamChat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    model: string,
    apiKey: string,
    callbacks: StreamCallbacks,
    options?: StreamChatOptions
  ): AbortController {
    const controller = new AbortController();

    void (async () => {
      try {
        const cleanKey = apiKey.trim();
        const isLocalEndpoint =
          this.providerId === "ollama" ||
          options?.baseUrl?.includes("localhost") ||
          options?.baseUrl?.includes("127.0.0.1");

        if (!cleanKey && !isLocalEndpoint) {
          callbacks.onError({
            code: "AUTH",
            message: tGlobal("services.ai.openai.keyMissing", { provider: this.providerId.toUpperCase() })
          });
          return;
        }

        let baseUrl = options?.baseUrl || this.defaultEndpoint;
        if (!baseUrl) {
          if (this.providerId === "openai") baseUrl = "https://api.openai.com/v1";
          else if (this.providerId === "groq") baseUrl = "https://api.groq.com/openai/v1";
          else if (this.providerId === "deepseek") baseUrl = "https://api.deepseek.com";
          else if (this.providerId === "openrouter") baseUrl = "https://openrouter.ai/api/v1";
          else if (this.providerId === "mistral") baseUrl = "https://api.mistral.ai/v1";
          else if (this.providerId === "xai") baseUrl = "https://api.x.ai/v1";
          else if (this.providerId === "ollama") baseUrl = "http://localhost:11434/v1";
          else {
            callbacks.onError({
              code: "NETWORK",
              message: tGlobal("services.ai.openai.baseUrlRequired")
            });
            return;
          }
        }

        baseUrl = baseUrl.replace(/\/+$/, "");
        let endpoint = baseUrl;
        if (endpoint.endsWith("/chat/completions")) {
          // already full path
        } else if (endpoint.endsWith("/v1")) {
          endpoint = `${endpoint}/chat/completions`;
        } else {
          endpoint = `${endpoint}/v1/chat/completions`;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (cleanKey) {
          headers.Authorization = `Bearer ${cleanKey}`;
        }
        if (this.providerId === "openrouter") {
          headers["HTTP-Referer"] = typeof window !== "undefined" ? window.location.origin : "https://jantt.dev";
          headers["X-Title"] = "Jantt AI Copilot";
        }

        const requestBody = {
          model: model || (this.providerId === "openai" ? "gpt-4o" : "llama-3.3-70b-versatile"),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.2,
          stream: true
        };

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        if (!response.ok) {
          let errorDetail = "";
          try {
            const errJson = await response.json();
            errorDetail = errJson?.error?.message || response.statusText;
          } catch {
            errorDetail = await response.text();
          }

          if (response.status === 401 || response.status === 403) {
            callbacks.onError({
              code: "AUTH",
              message: tGlobal("services.ai.openai.authFailed", { status: response.status, detail: errorDetail || tGlobal("services.ai.invalidKey") })
            });
            return;
          }

          if (response.status === 429) {
            callbacks.onError({
              code: "RATE_LIMIT",
              message: tGlobal("services.ai.openai.rateLimit", { detail: errorDetail || tGlobal("services.ai.tooManyRequests") })
            });
            return;
          }

          callbacks.onError({
            code: "UNKNOWN",
            message: tGlobal("services.ai.openai.requestFailed", { status: response.status, detail: errorDetail || response.statusText })
          });
          return;
        }

        if (!response.body) {
          callbacks.onError({ code: "NETWORK", message: tGlobal("services.ai.openai.emptyStream") });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let accumulatedFullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);
              const textChunk = data?.choices?.[0]?.delta?.content;
              if (textChunk) {
                accumulatedFullText += textChunk;
                callbacks.onToken(textChunk);
              }
            } catch {
              // Ignore partial frames
            }
          }
        }

        callbacks.onDone(accumulatedFullText);
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
          callbacks.onError({
            code: "NETWORK",
            message: tGlobal("services.ai.openai.connectFailed", { baseUrl: options?.baseUrl || "OpenAI" })
          });
          return;
        }
        callbacks.onError({
          code: "UNKNOWN",
          message: errorMsg || tGlobal("services.ai.openai.unexpected")
        });
      }
    })();

    return controller;
  }
}

import type { ProviderAdapter, StreamCallbacks, StreamChatOptions } from "../types";

export class OpenAiCompatibleAdapter implements ProviderAdapter {
  constructor(readonly providerId: "openai" | "openai-compatible") {}

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
        const isLocalEndpoint = options?.baseUrl?.includes("localhost") || options?.baseUrl?.includes("127.0.0.1");

        if (!cleanKey && !isLocalEndpoint && this.providerId === "openai") {
          callbacks.onError({
            code: "AUTH",
            message: "OpenAI API key is missing. Add your API key in Copilot settings."
          });
          return;
        }

        let baseUrl = options?.baseUrl || (this.providerId === "openai" ? "https://api.openai.com" : "");
        if (!baseUrl) {
          callbacks.onError({
            code: "NETWORK",
            message: "Base URL is required for custom OpenAI-compatible endpoints."
          });
          return;
        }

        baseUrl = baseUrl.replace(/\/+$/, "");
        const endpoint = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (cleanKey) {
          headers.Authorization = `Bearer ${cleanKey}`;
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
              message: `Authentication failed (${response.status}): ${errorDetail || "Invalid API key."}`
            });
            return;
          }

          if (response.status === 429) {
            callbacks.onError({
              code: "RATE_LIMIT",
              message: `Rate limit reached: ${errorDetail || "Too many requests. Please try again shortly."}`
            });
            return;
          }

          callbacks.onError({
            code: "UNKNOWN",
            message: `API request failed with code ${response.status}: ${errorDetail || response.statusText}`
          });
          return;
        }

        if (!response.body) {
          callbacks.onError({ code: "NETWORK", message: "Endpoint returned an empty response body stream." });
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
            message: `Could not connect to endpoint (${options?.baseUrl || "OpenAI"}). Check CORS settings or network reachability.`
          });
          return;
        }
        callbacks.onError({
          code: "UNKNOWN",
          message: errorMsg || "An unexpected error occurred while communicating with the OpenAI endpoint."
        });
      }
    })();

    return controller;
  }
}

import type { ProviderAdapter, StreamCallbacks, StreamChatOptions } from "../types";

export class AnthropicProviderAdapter implements ProviderAdapter {
  readonly providerId = "anthropic" as const;

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
        if (!cleanKey) {
          callbacks.onError({
            code: "AUTH",
            message: "Anthropic Claude API key is missing. Add your API key in Copilot settings."
          });
          return;
        }

        // Anthropic messages API requires system prompt in a separate field
        let systemPrompt = "";
        const formattedMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

        for (const msg of messages) {
          if (msg.role === "system") {
            systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
          } else {
            formattedMessages.push({
              role: msg.role === "assistant" ? "assistant" : "user",
              content: msg.content
            });
          }
        }

        // If user specified a proxy URL, use it; otherwise direct to api.anthropic.com
        const baseUrl = options?.baseUrl?.replace(/\/+$/, "") || "https://api.anthropic.com";
        const endpoint = baseUrl.endsWith("/v1/messages") ? baseUrl : `${baseUrl}/v1/messages`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
          "dangerously-allow-browser": "true"
        };

        const requestBody: Record<string, unknown> = {
          model: model || "claude-3-5-sonnet-20241022",
          messages: formattedMessages,
          max_tokens: options?.maxOutputTokens ?? 8192,
          temperature: options?.temperature ?? 0.2,
          stream: true
        };

        if (systemPrompt) {
          requestBody.system = systemPrompt;
        }

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
              message: `Anthropic authentication failed: ${errorDetail || "Invalid API key."}`
            });
            return;
          }

          if (response.status === 429) {
            callbacks.onError({
              code: "RATE_LIMIT",
              message: `Anthropic rate limit reached: ${errorDetail || "Too many requests. Please wait."}`
            });
            return;
          }

          callbacks.onError({
            code: "UNKNOWN",
            message: `Anthropic request failed (${response.status}): ${errorDetail || response.statusText}`
          });
          return;
        }

        if (!response.body) {
          callbacks.onError({ code: "NETWORK", message: "Anthropic returned an empty response body stream." });
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
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
                const textChunk = data.delta.text;
                if (textChunk) {
                  accumulatedFullText += textChunk;
                  callbacks.onToken(textChunk);
                }
              }
            } catch {
              // Ignore partial frame
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
            code: "CORS",
            message: "Direct Anthropic API calls are typically blocked by browser CORS restrictions. Please use a CORS proxy URL in settings, or use an OpenRouter key instead."
          });
          return;
        }
        callbacks.onError({
          code: "UNKNOWN",
          message: errorMsg || "An unexpected error occurred while communicating with Anthropic Claude."
        });
      }
    })();

    return controller;
  }
}

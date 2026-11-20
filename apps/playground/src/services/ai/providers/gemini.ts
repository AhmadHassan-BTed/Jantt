import type { ProviderAdapter, StreamCallbacks, StreamChatOptions } from "../types";

export class GeminiProviderAdapter implements ProviderAdapter {
  readonly providerId = "gemini" as const;

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
          callbacks.onError({ code: "AUTH", message: "Google Gemini API key is missing. Add your API key in Copilot settings." });
          return;
        }

        // Separate system instruction from conversation contents
        let systemInstructionText = "";
        const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

        for (const msg of messages) {
          if (msg.role === "system") {
            systemInstructionText += (systemInstructionText ? "\n\n" : "") + msg.content;
          } else {
            contents.push({
              role: msg.role === "assistant" ? "model" : "user",
              parts: [{ text: msg.content }]
            });
          }
        }

        // Gemini REST API endpoint
        const targetModel = model || "gemini-2.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:streamGenerateContent?key=${encodeURIComponent(cleanKey)}&alt=sse`;

        const requestBody: Record<string, unknown> = {
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.2,
            maxOutputTokens: options?.maxOutputTokens ?? 8192
          }
        };

        if (systemInstructionText) {
          requestBody.systemInstruction = {
            parts: [{ text: systemInstructionText }]
          };
        }

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
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
              message: `Gemini API authentication failed: ${errorDetail || "Invalid API key."}`
            });
            return;
          }

          if (response.status === 429) {
            callbacks.onError({
              code: "RATE_LIMIT",
              message: `Gemini rate limit reached: ${errorDetail || "Too many requests. Please wait a moment."}`
            });
            return;
          }

          callbacks.onError({
            code: "UNKNOWN",
            message: `Gemini API error (${response.status}): ${errorDetail || response.statusText}`
          });
          return;
        }

        if (!response.body) {
          callbacks.onError({ code: "NETWORK", message: "Gemini returned an empty response body stream." });
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
              const textChunk = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                accumulatedFullText += textChunk;
                callbacks.onToken(textChunk);
              }
            } catch {
              // Ignore partial JSON chunks across frames
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
            message: "Network request failed. Please verify your internet connection or check if the API is reachable."
          });
          return;
        }
        callbacks.onError({
          code: "UNKNOWN",
          message: errorMsg || "An unexpected error occurred while communicating with Gemini."
        });
      }
    })();

    return controller;
  }
}

import type { ProviderAdapter, StreamCallbacks, StreamChatOptions } from "../types";
import { tGlobal } from "../../../i18n";

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
          callbacks.onError({ code: "AUTH", message: tGlobal("services.ai.gemini.keyMissing") });
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
              message: tGlobal("services.ai.gemini.authFailed", { detail: errorDetail || tGlobal("services.ai.invalidKey") })
            });
            return;
          }

          if (response.status === 429) {
            callbacks.onError({
              code: "RATE_LIMIT",
              message: tGlobal("services.ai.gemini.rateLimit", { detail: errorDetail || tGlobal("services.ai.tooManyRequests") })
            });
            return;
          }

          callbacks.onError({
            code: "UNKNOWN",
            message: tGlobal("services.ai.gemini.requestFailed", { status: response.status, detail: errorDetail || response.statusText })
          });
          return;
        }

        if (!response.body) {
          callbacks.onError({ code: "NETWORK", message: tGlobal("services.ai.gemini.emptyStream") });
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
            message: tGlobal("services.ai.gemini.networkFailed")
          });
          return;
        }
        callbacks.onError({
          code: "UNKNOWN",
          message: errorMsg || tGlobal("services.ai.gemini.unexpected")
        });
      }
    })();

    return controller;
  }
}

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Transcribe audio buffer using Groq Whisper (lightning-fast, supports Arabic & Moroccan Darija)
 * with graceful fallback to OpenAI Whisper if Groq is unavailable.
 */
export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<string> {
  try {
    const settings = await prisma.settings.findFirst();
    const apiKey = settings?.aiApiKey || process.env.GROQ_API_KEY || "";
    const openAiKey = settings?.fallbackApiKey || process.env.OPENAI_API_KEY || "";

    // 1. Try Groq Whisper (whisper-large-v3-turbo)
    if (apiKey) {
      try {
        const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("mp3") ? "mp3" : "ogg";
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", blob, `audio.${ext}`);
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("language", "ar");
        function normalizeMoroccanTranscriptions(raw: string): string {
          if (!raw) return "";
          return raw
            // NO \b — does not work with Arabic text
            .replace(/(إنزجان|انزجان|إينزجان|انزكان|إنزكان)/g, "انزكان")
            .replace(/(إنزجان-أيت|انزجان-أيت|انزكان-أيت)/g, "انزكان-أيت")
            .replace(/(أيت ملول|ايت ملول|ايتملول|آيت ملول)/g, "ايت ملول")
            .replace(/(غميميط|اغميميط)/g, "اغميمط")
            .replace(/(تيزنيت|تزنيت|تيزنبت|تيزنت|تيزنيث|تيزنيط|تيزنيك|تيزنيت|تيزنيت|تيرنيت|تيرنيث|تيزنيت|تزينت)/g, "تيزنيت")
            .replace(/(تارودانت|تارودن|تارودنت|تارودنط|تارودنت|تارودنث)/g, "تارودانت")
            .replace(/(أكادير|اكادير|اغادير)/g, "اكادير")
            .replace(/(طنجة|طنجه|طنجت|طنجث)/g, "طنجة")
            .replace(/(كلميم|كليميم|كليمم)/g, "كلميم")
            .trim();
        }

        formData.append("prompt", "الجامعة الوطنية للتعليم FNE، الكاتب الإقليمي، الكاتب المحلي، إنزكان، إنزكان أيت ملول، تيزنيت، تارودانت، شتوكة آيت باها، أكادير، كلميم، طانطان، سيدي إفني، العيون، سوس ماسة، الرباط، الدار البيضاء، مراكش، فاس، مكناس، طنجة، وجدة، بني ملال، خنيفرة، ورزازات، الصويرة، آسفي، الجديدة، القنيطرة، ترقية بالاختيار، رخصة، النظام الأساسي، غميمط، نزهة مجدي");

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text && data.text.trim()) {
            const normalized = normalizeMoroccanTranscriptions(data.text.trim());
            logger.info("[Speech] Groq Whisper transcribed successfully:", { raw: data.text, normalized });
            return normalized;
          }
        } else {
          const errText = await res.text();
          logger.warn("[Speech] Groq Whisper failed, trying fallback:", { status: res.status, error: errText });
        }
      } catch (groqErr) {
        logger.warn("[Speech] Groq Whisper error, trying fallback:", { error: String(groqErr) });
      }
    }

    // 2. Fallback to OpenAI Whisper
    if (openAiKey) {
      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", blob, "audio.ogg");
        formData.append("model", "whisper-1");
        formData.append("language", "ar");

        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAiKey}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text && data.text.trim()) {
            logger.info("[Speech] OpenAI Whisper transcribed successfully:", { length: data.text.length });
            return data.text.trim();
          }
        }
      } catch (openAiErr) {
        logger.error("[Speech] OpenAI Whisper error:", { error: String(openAiErr) });
      }
    }

    throw new Error("No transcription service succeeded");
  } catch (error) {
    logger.error("[Speech] Audio transcription error:", { error: String(error) });
    throw error;
  }
}

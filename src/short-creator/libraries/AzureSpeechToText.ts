import fs from "fs-extra";
import axios from "axios";
import FormData from "form-data";
import path from "path";
import { Config } from "../../config";
import type { Caption } from "../../types/shorts";
import { logger } from "../../logger";

export const ErrorAzureSpeechToText = new Error("There was an error with Azure Speech-to-Text");

interface AzureWord {
  text: string;
  offsetMilliseconds: number;
  durationMilliseconds: number;
  word: string;
  offset: number;
  duration: number;
}

interface AzurePhrase {
  offsetMilliseconds: number;
  durationMilliseconds: number;
  text: string;
  words: AzureWord[];
  locale: string;
  confidence: number;
}

interface AzureTranscriptionResult {
  durationMilliseconds: number;
  combinedPhrases: string[];
  phrases: AzurePhrase[];
}

export class AzureSpeechToText {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  static async init(config: Config): Promise<AzureSpeechToText> {
    return new AzureSpeechToText(config);
  }

  async CreateCaption(audioPath: string): Promise<Caption[]> {
    logger.debug({ audioPath }, "Starting to transcribe audio with Azure");
    

    const apiKey = this.config.azureSpeechApiKey ?? process.env.AZURE_SPEECH_API_KEY ?? "bc5c80cd30c34d7ca7fb8dccafa65c95";
    const region = this.config.azureSpeechRegion ?? process.env.AZURE_SPEECH_REGION ?? "eastus";


    if (!apiKey || !region) {
      throw new Error("Azure Speech API key and region are required in config");
    }
    
    const endpoint = `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;

    const formData = new FormData();
    formData.append("audio", fs.createReadStream(audioPath));

    const response = await axios.post<AzureTranscriptionResult>(endpoint, formData, {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        ...formData.getHeaders(),
      },
    });

    const result = response.data;
    logger.debug({ audioPath }, "Transcription finished, creating captions");
    console.log(result);

    const captions: Caption[] = [];

    for (const phrase of result.phrases) {
      // Iterate over words in each phrase for word-level captions
      if (phrase.words && Array.isArray(phrase.words)) {
        for (const word of phrase.words) {
          // Word may have either offsetMilliseconds/offset or durationMilliseconds/duration
          const offsetMs = word.offsetMilliseconds ?? word.offset;
          const durationMs = word.durationMilliseconds ?? word.duration;
          const wordText = word.text ?? word.word;

          if (offsetMs !== undefined && durationMs !== undefined && wordText) {
            captions.push({
              text: wordText,
              startMs: offsetMs,
              endMs: offsetMs + durationMs,
            });
          }
        }
      }
    }

    logger.debug({ audioPath, captions }, "Captions created");
    return captions;
  }
}

// Test code - run with: npx ts-node src/short-creator/libraries/AzureSpeechToText.ts
/*
(async () => {
  const config = {
    azureSpeechApiKey: "bc5c80cd30c34d7ca7fb8dccafa65c95",
    azureSpeechRegion: "eastus",
  } as unknown as Config;
  const mockAudioPath = path.resolve("__mocks__/test-audio/test.mp3");
  const azure = await AzureSpeechToText.init(config);
  const captions = await azure.CreateCaption(mockAudioPath);

  console.log("Captions:", captions);
})();
*/

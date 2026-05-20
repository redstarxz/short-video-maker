process.env.LOG_LEVEL = "debug";

import nock from "nock";
import { AzureSpeechToText } from "./AzureSpeechToText";
import { test, assert, expect, describe, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import { Config } from "../../config";

describe("AzureSpeechToText", () => {
  const mockAudioPath = path.resolve("__mocks__/test-audio/test.mp3");
  const mockRegion = "eastus";
  const mockApiKey = "bc5c80cd30c34d7ca7fb8dccafa65c95";

  beforeEach(() => {
    // Clean up any existing nocks
    nock.cleanAll();
  });

  test("should transcribe audio and return word-level captions", async () => {
    const mockResponse = fs.readFileSync(
      path.resolve("__mocks__/azure-speech-response.json"),
      "utf-8",
    );

    nock(`https://${mockRegion}.api.cognitive.microsoft.com`)
      .post(/\/speechtotext\/transcriptions:transcribe/)
      .reply(200, JSON.parse(mockResponse));

    const config = {
      azureSpeechApiKey: mockApiKey,
      azureSpeechRegion: mockRegion,
    } as unknown as Config;

    const azure = await AzureSpeechToText.init(config);
    const captions = await azure.CreateCaption(mockAudioPath);

    console.log("Captions:", captions);
    assert.isArray(captions, "Captions should be an array");

    // Should have 27 words total (12 + 4 + 1 + 10)
    assert.strictEqual(captions.length, 27, "Should have 27 word-level captions");

    // First word: "To" at 80ms to 180ms
    assert.strictEqual(captions[0].text, "To");
    assert.strictEqual(captions[0].startMs, 80);
    assert.strictEqual(captions[0].endMs, 180);

    // Last word: "it." at 6830ms to 7030ms
    assert.strictEqual(captions[captions.length - 1].text, "it.");
    assert.strictEqual(captions[captions.length - 1].startMs, 6830);
    assert.strictEqual(captions[captions.length - 1].endMs, 7030);
  });

  test("should handle phrases without words array", async () => {
    const mockResponse = {
      durationMilliseconds: 1000,
      combinedPhrases: [],
      phrases: [
        {
          offsetMilliseconds: 0,
          durationMilliseconds: 1000,
          text: "Hello world.",
          locale: "en-US",
          confidence: 0.9,
        },
      ],
    };

    nock(`https://${mockRegion}.api.cognitive.microsoft.com`)
      .post(/\/speechtotext\/transcriptions:transcribe/)
      .reply(200, mockResponse);

    const config = {
      azureSpeechApiKey: mockApiKey,
      azureSpeechRegion: mockRegion,
    } as unknown as Config;

    const azure = await AzureSpeechToText.init(config);
    const captions = await azure.CreateCaption(mockAudioPath);

    assert.strictEqual(captions.length, 0, "Should have 0 captions when no words array");
  });

  test("should handle words with text property instead of word", async () => {
    const mockResponse = {
      durationMilliseconds: 1000,
      combinedPhrases: [],
      phrases: [
        {
          offsetMilliseconds: 0,
          durationMilliseconds: 500,
          text: "Hello.",
          words: [
            { "text": "Hello.", "offsetMilliseconds": 0, "durationMilliseconds": 500 },
          ],
          locale: "en-US",
          confidence: 0.9,
        },
      ],
    };

    nock(`https://${mockRegion}.api.cognitive.microsoft.com`)
      .post(/\/speechtotext\/transcriptions:transcribe/)
      .reply(200, mockResponse);

    const config = {
      azureSpeechApiKey: mockApiKey,
      azureSpeechRegion: mockRegion,
    } as unknown as Config;

    const azure = await AzureSpeechToText.init(config);
    const captions = await azure.CreateCaption(mockAudioPath);

    assert.strictEqual(captions.length, 1, "Should have 1 caption");
    assert.strictEqual(captions[0].text, "Hello.");
    assert.strictEqual(captions[0].startMs, 0);
    assert.strictEqual(captions[0].endMs, 500);
  });

  test("should throw error when API key is missing", async () => {
    const config = {
      azureSpeechApiKey: "",
      azureSpeechRegion: mockRegion,
    } as unknown as Config;

    const azure = await AzureSpeechToText.init(config);

    await expect(azure.CreateCaption(mockAudioPath)).rejects.toThrow(
      "Azure Speech API key and region are required in config"
    );
  });

  test("should throw error when region is missing", async () => {
    const config = {
      azureSpeechApiKey: mockApiKey,
      azureSpeechRegion: "",
    } as unknown as Config;

    const azure = await AzureSpeechToText.init(config);

    await expect(azure.CreateCaption(mockAudioPath)).rejects.toThrow(
      "Azure Speech API key and region are required in config"
    );
  });

  test("should throw error when API returns non-200 status", async () => {
    nock(`https://${mockRegion}.api.cognitive.microsoft.com`)
      .post(/\/speechtotext\/transcriptions:transcribe/)
      .reply(401, {
        error: {
          code: "Unauthorized",
          message: "Invalid API key"
        }
      });

    const config = {
      azureSpeechApiKey: mockApiKey,
      azureSpeechRegion: mockRegion,
    } as unknown as Config;

    const azure = await AzureSpeechToText.init(config);

    await expect(azure.CreateCaption(mockAudioPath)).rejects.toThrow();
  });
});
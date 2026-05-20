import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";
import http from "http";
import https from "https";
import { logger } from "../../logger";

export class FFMpeg {
  static async init(): Promise<FFMpeg> {
    return import("@ffmpeg-installer/ffmpeg").then((ffmpegInstaller) => {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      return new FFMpeg();
    });
  }

  async saveNormalizedAudio(
    audio: ArrayBuffer,
    outputPath: string,
  ): Promise<string> {
    logger.debug("Normalizing audio for Whisper");
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .on("end", () => {
          logger.debug("Audio normalization complete");
          resolve(outputPath);
        })
        .on("error", (error: unknown) => {
          logger.error(error, "Error normalizing audio:");
          reject(error);
        })
        .save(outputPath);
    });
  }

  async createMp3DataUri(audio: ArrayBuffer): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      const chunk: Buffer[] = [];

      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .on("error", (err) => {
          reject(err);
        })
        .pipe()
        .on("data", (data: Buffer) => {
          chunk.push(data);
        })
        .on("end", () => {
          const buffer = Buffer.concat(chunk);
          resolve(`data:audio/mp3;base64,${buffer.toString("base64")}`);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async saveToMp3(audio: ArrayBuffer, filePath: string): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .save(filePath)
        .on("end", () => {
          logger.debug("Audio conversion complete");
          resolve(filePath);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async downloadAudio(url: string): Promise<ArrayBuffer> {
    const protocol = url.startsWith("https:") ? https : http;

    return new Promise((resolve, reject) => {
      protocol
        .get(url, (response: http.IncomingMessage) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download audio: ${response.statusCode}`));
            return;
          }

          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });
          response.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
          });
        })
        .on("error", (err) => {
          logger.error(err, "Error downloading audio");
          reject(err);
        });
    });
  }

  async saveNormalizedAudioFromUrl(url: string, outputPath: string): Promise<{ path: string; duration: number }> {
    logger.debug(`Downloading audio from ${url}`);
    const audio = await this.downloadAudio(url);
    await this.saveNormalizedAudio(audio, outputPath);

    // Get audio duration
    const duration = await this.getAudioDuration(outputPath);
    return { path: outputPath, duration };
  }

  async saveToMp3FromUrl(url: string, filePath: string): Promise<{ path: string; duration: number }> {
    logger.debug(`Downloading audio from ${url}`);
    const audio = await this.downloadAudio(url);
    await this.saveToMp3(audio, filePath);

    // Get audio duration
    const duration = await this.getAudioDuration(filePath);
    return { path: filePath, duration };
  }

  async generateSilence(durationSec: number, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(`anullsrc=r=16000:cl=mono`)
        .inputFormat("lavfi")
        .audioCodec("pcm_s16le")
        .duration(durationSec)
        .on("end", () => {
          logger.debug("Silence generation complete");
          resolve(outputPath);
        })
        .on("error", (error: unknown) => {
          logger.error(error, "Error generating silence:");
          reject(error);
        })
        .save(outputPath);
    });
  }

  async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(new Error(`Failed to get video duration: ${error.message}`));
          return;
        }

        const duration = metadata?.format?.duration;

        if (typeof duration !== 'number' || isNaN(duration)) {
          reject(new Error('Invalid video duration metadata'));
          return;
        }

        resolve(duration);
      });
    });
  }

  async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(new Error(`Failed to get audio duration: ${error.message}`));
          return;
        }

        const duration = metadata?.format?.duration;

        if (typeof duration !== 'number' || isNaN(duration)) {
          reject(new Error('Invalid duration metadata'));
          return;
        }

        resolve(duration);
      });
    });
  }
}

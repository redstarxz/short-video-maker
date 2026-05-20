/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from "fs-extra";

import { Remotion } from "./short-creator/libraries/Remotion";
import { FFMpeg } from "./short-creator/libraries/FFmpeg";
import { Config } from "./config";
import { ShortCreator } from "./short-creator/ShortCreator";
import { logger } from "./logger";
import { Server } from "./server/server";
import { MusicManager } from "./short-creator/music";

async function main() {
  const config = new Config();

  const musicManager = new MusicManager(config);
  try {
    logger.debug("checking music files");
    musicManager.ensureMusicFilesExist();
  } catch (error: unknown) {
    logger.error(error, "Missing music files");
    process.exit(1);
  }

  logger.debug("initializing remotion");
  const remotion = await Remotion.init(config);
  logger.debug("initializing ffmpeg");
  const ffmpeg = await FFMpeg.init();

  logger.debug("initializing short creator");
  const shortCreator = new ShortCreator(
    config,
    remotion,
    ffmpeg,
    musicManager
  );

  logger.debug("initializing server");
  const server = new Server(config, shortCreator);
  server.start();

  // todo add shutdown handler
}

main().catch((error: unknown) => {
  logger.error(error, "Error starting server");
});
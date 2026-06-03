import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import { log } from '../utils/logger';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export function checkFfmpeg(): void {
  try {
    const p = ffmpegInstaller.path;
    if (!p) throw new Error('ffmpeg binary path is empty');
    log.info(`ffmpeg binary: ${p}`);
  } catch (err) {
    log.error(
      `ffmpeg not available: ${err instanceof Error ? err.message : String(err)}\n` +
        `Install via: npm install @ffmpeg-installer/ffmpeg`
    );
    process.exit(1);
  }
}

export function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err: Error, audioMeta: FfprobeData) => {
      if (err) return reject(new Error(`ffprobe audio failed: ${err.message}`));

      ffmpeg.ffprobe(videoPath, (err2: Error, videoMeta: FfprobeData) => {
        if (err2) return reject(new Error(`ffprobe video failed: ${err2.message}`));

        const audioDuration = audioMeta.format.duration ?? 0;
        const videoDuration = videoMeta.format.duration ?? 0;

        const cmd = ffmpeg();

        if (audioDuration > videoDuration) {
          cmd
            .input(videoPath)
            .inputOptions(['-stream_loop', '-1'])
            .input(audioPath)
            .outputOptions([
              `-t ${audioDuration}`,
              '-c:v libx264',
              '-c:a aac',
              '-shortest',
              '-movflags +faststart',
            ]);
        } else {
          cmd
            .input(videoPath)
            .input(audioPath)
            .outputOptions([
              `-t ${audioDuration}`,
              '-c:v libx264',
              '-c:a aac',
              '-movflags +faststart',
            ]);
        }

        cmd
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', (e: Error) => reject(new Error(`ffmpeg merge failed: ${e.message}`)))
          .run();
      });
    });
  });
}

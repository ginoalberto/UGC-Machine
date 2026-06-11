import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import { log } from '../utils/logger';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export function checkFfmpeg(): void {
  const p = ffmpegInstaller.path;
  if (!p) {
    log.error('ffmpeg binary not found. Run: npm install @ffmpeg-installer/ffmpeg');
    process.exit(1);
  }
  log.info(`ffmpeg binary: ${p}`);
}

export function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err: Error, audioMeta: FfprobeData) => {
      if (err) return reject(new Error(`ffprobe audio: ${err.message}`));

      ffmpeg.ffprobe(videoPath, (err2: Error, videoMeta: FfprobeData) => {
        if (err2) return reject(new Error(`ffprobe video: ${err2.message}`));

        const audioDur = audioMeta.format.duration ?? 0;
        const videoDur = videoMeta.format.duration ?? 0;

        const cmd = ffmpeg();

        if (audioDur > videoDur) {
          cmd
            .input(videoPath).inputOptions(['-stream_loop', '-1'])
            .input(audioPath)
            .outputOptions([`-t ${audioDur}`, '-c:v libx264', '-c:a aac', '-shortest', '-movflags +faststart']);
        } else {
          cmd
            .input(videoPath)
            .input(audioPath)
            .outputOptions([`-t ${audioDur}`, '-c:v libx264', '-c:a aac', '-movflags +faststart']);
        }

        cmd
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', (e: Error) => reject(new Error(`ffmpeg merge: ${e.message}`)))
          .run();
      });
    });
  });
}

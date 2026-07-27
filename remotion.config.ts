import { Config } from "@remotion/cli/config";

// JPEG frames render meaningfully faster than PNG and the difference is
// invisible once x264 has re-encoded them.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(90);

// GitHub's free runners are 2-core (4-core on public repos). Going higher
// than the core count makes renders slower, not faster.
Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY ?? 2));

Config.setCodec("h264");
Config.setCrf(23);
Config.setChromiumOpenGlRenderer("swangle");
Config.setOverwriteOutput(true);

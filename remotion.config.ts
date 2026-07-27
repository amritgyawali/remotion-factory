import { Config } from "@remotion/cli/config";
import { availableParallelism } from "node:os";

/**
 * This project renders exactly one video per workflow run, so a render owns
 * the whole machine. Every setting below spends that capacity on a single
 * clip rather than spreading it thin across a batch.
 */

// JPEG frames render meaningfully faster than PNG. At quality 100 the
// intermediate is effectively lossless, so x264 — not the frame format —
// decides the final image.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(100);

// One video at a time means every core can work on it. Remotion opens one
// browser tab per unit of concurrency, and a 1080x1920 tab sits well inside
// the memory each runner core has to itself.
const cores = availableParallelism();
const requested = Number(process.env.REMOTION_CONCURRENCY);
Config.setConcurrency(Number.isFinite(requested) && requested > 0 ? requested : cores);

Config.setCodec("h264");

// CRF 18 is the visually-transparent end of the useful range. Social
// platforms re-encode whatever they receive, so handing them a high-quality
// master is what survives that second pass — a lean file just compounds.
Config.setCrf(18);

// Slower x264 analysis costs encode time we can afford on a single clip and
// buys real bitrate efficiency on flat colour fields and type, which is
// almost the entire frame in these templates.
Config.setX264Preset("slow");

// swangle is the software GL path. Deterministic across machines, which
// matters when the only person who ever reads the render log is a cron job.
Config.setChromiumOpenGlRenderer("swangle");
Config.setOverwriteOutput(true);

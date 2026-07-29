import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(17);
Config.setChromiumDisableWebSecurity(false);
// Silent-edit mixes are dense; keep the audio path lossless until the final mux.
Config.setAudioCodec('aac');
Config.setAudioBitrate('256k');
Config.setConcurrency(4);

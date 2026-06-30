import { Audio } from 'expo-av';

let recording: Audio.Recording | null = null;

export async function kayitBaslat(): Promise<void> {
  await Audio.requestPermissionsAsync();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording: rec } = await Audio.Recording.createAsync({
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 32000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.MEDIUM,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 32000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {},
  });
  recording = rec;
}

export async function kayitBitir(): Promise<string | null> {
  if (!recording) return null;
  const rec = recording;
  recording = null;
  try {
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    return uri ?? null;
  } catch (e) {
    console.log('[PERA-AUD] kayitBitir hata:', e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }
}

export async function kayitIptal(): Promise<void> {
  if (!recording) return;
  try {
    await recording.stopAndUnloadAsync();
  } catch {}
  recording = null;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
}

export function kayitDevamEdiyor(): boolean {
  return recording !== null;
}

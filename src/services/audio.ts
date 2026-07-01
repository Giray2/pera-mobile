import { requestRecordingPermissionsAsync, setAudioModeAsync, IOSOutputFormat, AudioQuality } from 'expo-audio';
import type { AudioRecorder, RecordingOptions } from 'expo-audio';

export const KAYIT_AYARLARI: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

// AudioRecorder ornegi expo-audio'da yalnizca useAudioRecorder() hook'u ile
// olusturulabiliyor (paket disardan sadece tip olarak export ediyor) - bu yuzden
// recorder instance'i hook tarafinda tutulur, buradaki fonksiyonlar onu parametre alir.

export async function kayitBaslat(recorder: AudioRecorder): Promise<void> {
  await requestRecordingPermissionsAsync();
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
  await recorder.prepareToRecordAsync();
  recorder.record();
}

export async function kayitBitir(recorder: AudioRecorder): Promise<string | null> {
  try {
    await recorder.stop();
    return recorder.uri ?? null;
  } catch (e) {
    console.log('[PERA-AUD] kayitBitir hata:', e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }
}

export async function kayitIptal(recorder: AudioRecorder): Promise<void> {
  try {
    await recorder.stop();
  } catch {}
  await setAudioModeAsync({ allowsRecording: false });
}

export const ENV = {
  API_BASE_URL: 'http://192.168.99.1:5000',
  FIRMA_NO: '226',
  DONEM_NO: '01',
  TOKEN_KEY: 'pera_token',
  USER_KEY: 'pera_user',
  CHAT_HISTORY_KEY: 'pera_chat_v2',
  MAX_CHAT_HISTORY: 30,
  REQUEST_TIMEOUT_MS: 60_000,
  AUDIO_UPLOAD_TIMEOUT_MS: 120_000,
  // true yapılırsa release build'de de console.log çalışır (adb logcat /
  // idevicesyslog ile canlı cihaz teşhisi için) — normalde kapalı: 36 adet
  // tanı logu her tanıma ara-sonucunda string üretip performansı yiyordu.
  DEBUG_LOG: false,
};

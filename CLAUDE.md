# PERA v2 (build2-PERA-v2)

## Proje Amacı
PAKSET iç görev/iş takip mobil uygulaması, sesli+yazılı PERA AI asistanı desteğiyle.
Görev oluşturma/listeleme/detay, sesli kayıt + konuşma tanıma (`useSurekliDinleme.ts`,
`useAudioRecord.ts`). Üç 159-PERA sürümü arasında muhtemelen en güncel/aktif hat.

## Teknoloji Stack
TypeScript, React Native 0.85.3 + Expo SDK 56, @react-navigation (stack+tabs), axios,
async-storage/secure-store, expo-audio/av/speech/speech-recognition, expo-notifications +
Firebase. Paket: `com.pakset.pera`.

## Build/Test
`npx expo run:android` / EAS yok burada — `android/` prebuild edilmiş. Otomatik test yok.

## Yasaklı Operasyonlar / Riskler
- `usesCleartextTraffic: true` (Android, HTTP) — sadece LAN içinde güvenli, **dış ağa
  AÇILMAMALI**.
- **Bu proje 159 makinesinde `claude --print --dangerously-skip-permissions` ile SSH
  üzerinden PERA Orkestratör tarafından yönetiliyor** (`.claude/` klasörüne bak) — Gemini
  API yolu KULLANILMAZ, oturum açık Claude doğrudan bu makinede çalışır. Orkestratör
  kodu değiştirirken bu yönlendirmeyi bozma (bkz. `proje_yonetici.py` SSH_ROUTE_MAKINELERI).

## Önemli Notlar
- **API adresi:** `http://192.168.100.175:5000` (`src/config/env.ts`,
  `ENV.API_BASE_URL`) — 175'teki PERA-API'ye bağlanıyor.
  `REQUEST_TIMEOUT_MS`=60000, `AUDIO_UPLOAD_TIMEOUT_MS`=120000.
- Firebase/google-services.json entegre (push bildirim).
- Android `versionCode: 20` — production yayın durumu netleşmedi.

## Bağlantılar
- **PERA-API** (175): TEK backend — `192.168.100.175:5000`.
- **PERA-Mobile** ve **build2-PERA-Mobile** (aynı makine, 159): aynı ürün ailesinin
  önceki/paralel sürümleri, aynı bundle id ve aynı API.

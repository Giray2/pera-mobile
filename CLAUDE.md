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
EAS Build kullanılıyor (`eas build --platform android/ios --profile production/preview`).
`android/`+`ios/` gitignore'lu (managed workflow, EAS cloud'da prebuild). Yerel test icin
`npx expo run:ios` de mumkun (Xcode 16.2 bu Mac'te kurulu, ama Swift 6.2 gerektiren bazi
bagimliliklar bu Xcode surumunu asiyor - EAS cloud build tercih edilmeli). Otomatik test yok.

## Yasaklı Operasyonlar / Riskler
- `usesCleartextTraffic: true` (Android, HTTP) — sadece LAN içinde güvenli, **dış ağa
  AÇILMAMALI**.
- **Bu proje 159 makinesinde `claude --print --dangerously-skip-permissions` ile SSH
  üzerinden PERA Orkestratör tarafından yönetiliyor** (`.claude/` klasörüne bak) — Gemini
  API yolu KULLANILMAZ, oturum açık Claude doğrudan bu makinede çalışır. Orkestratör
  kodu değiştirirken bu yönlendirmeyi bozma (bkz. `proje_yonetici.py` SSH_ROUTE_MAKINELERI).

## Önemli Notlar
- **API adresi:** `http://192.168.99.1:5000` (`src/config/env.ts`, `ENV.API_BASE_URL`) —
  DMZ'deki PERA-API'ye (IIS, secret'lar env var'da) bağlanıyor. Eski 175 (ic ag,
  Scheduled Task) yedek/deprecated. `ENV.FIRMA_NO`/`DONEM_NO` ('226'/'01') artik
  `api.ts`'nin axios instance default header'larina (X-Firma-No/X-Donem-No) ekleniyor —
  BU HEADER'LAR OLMADAN TUM /api/chat VE /api/ses ISTEKLERI "Firma numarasi bulunamadi"
  ile basarisiz olur, degistirirken dikkat.
  `REQUEST_TIMEOUT_MS`=60000, `AUDIO_UPLOAD_TIMEOUT_MS`=120000.
- Firebase/google-services.json entegre (push bildirim).
- Android `versionCode: 20` — production yayın durumu netleşmedi.

## Bağlantılar
- **PERA-API** (175): TEK backend — `192.168.100.175:5000`.
- **PERA-Mobile** ve **build2-PERA-Mobile** (aynı makine, 159): aynı ürün ailesinin
  önceki/paralel sürümleri, aynı bundle id ve aynı API.

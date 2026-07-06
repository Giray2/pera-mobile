import { useRef, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type DinlemeDurum = 'kapali' | 'bekliyor' | 'konusuyor' | 'isleniyor';

const LOCALE = 'tr-TR';
const RESTART_GECIKME_MS = 800;
const NETWORK_RETRY_MS   = 4000;
const CAPTURE_RETRY_MS   = 6000;
const WAKE_ZAMAN_ASIMI   = 5000;   // "pera" duyulduktan sonra komut için bekleme süresi
const KONUSMA_MODU_SURESI = 18000; // PERA cevap verdikten sonra "pera" demeden devam edebilme penceresi
// BARGE-IN (sesle kesinti): PERA konuşurken gelen ara (interim) sonuç en az bu kadar
// karakter/kelime içermiyorsa YOK SAYILIR — kısa gürültü/yankı parçacıklarının
// (PERA'nın kendi sesinin mikrofona karışması) yanlışlıkla kesinti tetiklemesini
// azaltır. Gerçek cihazda ayarlanması/ince ayar gerekebilir (bkz. AGENTS.md notu).
const KESINTI_MIN_KELIME = 2;

const ERP_TERIMLER = [
  'pera', 'sipariş', 'fatura', 'stok', 'ürün', 'müşteri', 'cari',
  'parça', 'sevkiyat', 'teslim', 'bakiye', 'depo', 'satış',
];

// "Hey Pera" / "Pera" TEK BAŞINA (komutsuz) söylendiğinde sesli onay için — her
// seferinde aynı cümle robotik hissettirir, bu yüzden rastgele seçilen 10 varyasyon.
const WAKE_ONAY_IFADELERI = [
  'Dinliyorum',
  'Buyurun',
  'Evet, dinliyorum',
  'Sizi dinliyorum',
  'Söyleyin',
  'Buyurun, sorunuzu alayım',
  'Merhaba, dinliyorum',
  'Evet?',
  'Sorun bakalım',
  'Hazırım, buyurun',
];

function wakeAyikla(metin: string): { wake: boolean; komut: string } {
  const t = metin.toLowerCase().trim();
  const m = t.match(/\b(hey\s+)?(pera|peral|bera|vera|pere|hera|perra|para)\b/);
  if (!m) return { wake: false, komut: '' };
  const idx = (m.index ?? 0) + m[0].length;
  const komut = metin.slice(idx).replace(/^[\s,.:;!?]+/, '').trim();
  return { wake: true, komut };
}

export function useSurekliDinleme(
  onSoru: (metin: string) => void,
  etkin: boolean,
  // BARGE-IN: PERA şu an sesli cevap veriyorsa true — bu durumda gelen bir konuşma
  // otomatik "kesinti" sayılır (wake-word beklemeden). onKesinti çağrılır (ChatScreen
  // bunu Speech.stop() için kullanır), ardından metin normal komut gibi işlenir.
  peraKonusuyorMu: boolean = false,
  onKesinti?: () => void,
  // "Hey Pera"/"Pera" komutsuz (tek başına) söylendiğinde çağrılır — seçilen onay
  // ifadesini (ör. "Dinliyorum") parametre olarak alır, ChatScreen bunu sesliOku ile
  // seslendirir. Sesli geri bildirim olmadan kullanıcı wake-word'ün duyulduğunu
  // anlayamıyordu (yalnızca küçük bir ekran metni değişiyordu).
  onWakeTetiklendi?: (ifade: string) => void,
) {
  const [durum, setDurum]                 = useState<DinlemeDurum>('kapali');
  const [sonTranscript, setSonTranscript] = useState('');

  const r = useRef({
    etkin:           false,
    calisiyor:       false,
    wakeAktif:       false,
    peraKonusuyorMu: false,
    restartTimer:    null as ReturnType<typeof setTimeout> | null,
    wakeTimer:       null as ReturnType<typeof setTimeout> | null,
  });
  r.current.peraKonusuyorMu = peraKonusuyorMu;

  const onSoruRef = useRef(onSoru);
  onSoruRef.current = onSoru;
  const onKesintiRef = useRef(onKesinti);
  onKesintiRef.current = onKesinti;
  const onWakeTetiklendiRef = useRef(onWakeTetiklendi);
  onWakeTetiklendiRef.current = onWakeTetiklendi;

  const setDur = useCallback((d: DinlemeDurum) => setDurum(d), []);

  const wakeTimerTemizle = useCallback(() => {
    if (r.current.wakeTimer) {
      clearTimeout(r.current.wakeTimer);
      r.current.wakeTimer = null;
    }
  }, []);

  // sure verilmezse normal "pera" bekleme süresi (5sn) kullanılır — KONUSMA_MODU_SURESI
  // (18sn) ise PERA cevap verdikten SONRA, kullanıcı tekrar "pera" demeden devam
  // edebilsin diye ChatScreen tarafından (konusmaModunuAc ile) tetiklenir.
  const wakeAktifYap = useCallback((sure: number = WAKE_ZAMAN_ASIMI) => {
    wakeTimerTemizle();
    r.current.wakeAktif = true;
    r.current.wakeTimer = setTimeout(() => {
      r.current.wakeAktif = false;
      r.current.wakeTimer = null;
      if (r.current.etkin) setSonTranscript('"pera" deyin...');
    }, sure);
  }, [wakeTimerTemizle]);

  // KONUŞMA MODU: dışarıdan (ChatScreen, PERA'nın cevabı bitince) çağrılır — kullanıcı
  // bir sonraki soru için "pera" demek ZORUNDA KALMAZ, 18 saniye içinde doğrudan sorabilir.
  const konusmaModunuAc = useCallback(() => {
    wakeAktifYap(KONUSMA_MODU_SURESI);
    setSonTranscript('Dinliyorum, sorabilirsiniz...');
    // Dinleyici artık soru-cevap arasında hiç abort edilmiyor (bkz. ChatScreen), bu
    // yüzden native 'start' event'i tekrar tetiklenip durumu 'bekliyor'a döndürmüyor
    // — önceki cevabın 'isleniyor' durumunda ekranda takılı kalmaması için burada
    // elle sıfırlanıyor.
    setDur('bekliyor');
  }, [wakeAktifYap, setDur]);

  const wakeTemizle = useCallback(() => {
    wakeTimerTemizle();
    r.current.wakeAktif = false;
  }, [wakeTimerTemizle]);

  // ── Recognizer başlat ──────────────────────────────────────────────────────
  const baslatRef = useRef<(() => Promise<void>) | undefined>(undefined);
  baslatRef.current = async () => {
    const st = r.current;
    if (!st.etkin || st.calisiyor) return;

    // Cihaz desteği kontrolü — getSpeechRecognitionServices() SADECE ANDROID'E ÖZEL
    // (paket adı listesi döndürür); iOS'ta bu liste HER ZAMAN boş dönüyor, bu yüzden
    // Android dışında çalıştırılırsa iOS'ta "desteklenmiyor" diyip özelliği tamamen
    // engelliyordu (canlı testte tam da bu şekilde ortaya çıktı — iOS'ta konuşma
    // tanıma normalde Apple'ın kendi Speech framework'ü üzerinden gayet destekleniyor).
    if (Platform.OS === 'android') {
      try {
        const servisler = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
        if (servisler.length === 0) {
          setSonTranscript('Konuşma tanıma bu cihazda desteklenmiyor');
          setDur('kapali');
          return;
        }
      } catch {}
    }

    const izin = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!izin.granted) {
      setSonTranscript('Mikrofon izni yok!');
      setDur('kapali');
      return;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: LOCALE,
        interimResults: true,
        continuous: true,
        contextualStrings: ERP_TERIMLER,
        maxAlternatives: 1,
      });
      st.calisiyor = true;
      console.log('[PERA-SR] start() çağrıldı');
    } catch (e) {
      console.log('[PERA-SR] start HATA:', e instanceof Error ? e.message : String(e));
      setSonTranscript(`Başlatma hatası: ${e instanceof Error ? e.message : String(e)}`);
      planlaRestart(RESTART_GECIKME_MS);
    }
  };

  const planlaRestart = useCallback((gecikme: number = RESTART_GECIKME_MS) => {
    const st = r.current;
    if (!st.etkin) return;
    if (st.restartTimer) clearTimeout(st.restartTimer);
    st.restartTimer = setTimeout(() => {
      st.restartTimer = null;
      baslatRef.current?.();
    }, gecikme);
  }, []);

  // ── Final sonuç işleme ─────────────────────────────────────────────────────
  const sonucIsleRef = useRef<((metin: string) => void) | undefined>(undefined);
  sonucIsleRef.current = (metin: string) => {
    const st = r.current;
    const temiz = metin.trim();
    if (!temiz) return;

    // BARGE-IN: PERA konuşurken gelen yeterince uzun bir final sonuç, wake-word
    // ARANMADAN doğrudan kesinti + yeni komut sayılır (ChatGPT'deki "konuşarak
    // susturma" mantığı). Kısa/tek kelimelik sonuçlar (muhtemelen PERA'nın kendi
    // sesinin mikrofona karışması/yankı) YOK SAYILIR.
    if (st.peraKonusuyorMu) {
      const kelimeSayisi = temiz.split(/\s+/).filter(Boolean).length;
      if (kelimeSayisi >= KESINTI_MIN_KELIME) {
        console.log('[PERA-SR] BARGE-IN tetiklendi:', JSON.stringify(temiz));
        onKesintiRef.current?.();
        wakeTemizle();
        setDur('isleniyor');
        setSonTranscript(`▶ ${temiz}`);
        onSoruRef.current(temiz);
      }
      return;
    }

    const { wake, komut } = wakeAyikla(temiz);
    console.log('[PERA-SR] final:', JSON.stringify(temiz), 'wake:', wake, 'komut:', JSON.stringify(komut), 'wakeAktif:', st.wakeAktif);

    if (wake && komut) {
      wakeTemizle();
      setDur('isleniyor');
      setSonTranscript(`▶ ${komut}`);
      onSoruRef.current(komut);
    } else if (wake && !komut) {
      wakeAktifYap();
      const ifade = WAKE_ONAY_IFADELERI[Math.floor(Math.random() * WAKE_ONAY_IFADELERI.length)];
      setSonTranscript(ifade);
      onWakeTetiklendiRef.current?.(ifade);
    } else if (st.wakeAktif) {
      wakeTemizle();
      setDur('isleniyor');
      setSonTranscript(`▶ ${temiz}`);
      onSoruRef.current(temiz);
    } else {
      setSonTranscript(`"${temiz}" (pera yok)`);
    }
  };

  // ── Native event listener'ları ─────────────────────────────────────────────
  useSpeechRecognitionEvent('start', () => {
    if (!r.current.etkin) return;
    console.log('[PERA-SR] event: start');
    r.current.calisiyor = true;
    setDur('bekliyor');
    if (!r.current.wakeAktif) setSonTranscript('"pera" deyin...');
  });

  useSpeechRecognitionEvent('result', (e) => {
    if (!r.current.etkin) return;
    const transcript = e.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    if (e.isFinal) {
      sonucIsleRef.current?.(transcript);
    } else {
      setDur('konusuyor');
      setSonTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    console.log('[PERA-SR] event: error', e.error, e.message);
    r.current.calisiyor = false;

    if (e.error === 'not-allowed') {
      setSonTranscript('Mikrofon izni reddedildi');
      setDur('kapali');
      return;
    }

    if (e.error === 'language-not-supported') {
      // Türkçe dil paketi yüklü değil; otomatik yeniden dene
      console.log('[PERA-SR] Türkçe dil paketi eksik olabilir');
      setSonTranscript('Türkçe dil paketi yüklü değil');
      setDur('kapali');
      return;
    }

    if (e.error === 'service-not-allowed') {
      setSonTranscript('Konuşma tanıma servisi kullanılamıyor');
      setDur('kapali');
      return;
    }

    if (e.error === 'audio-capture') {
      // Mikrofon başka uygulama tarafından kullanılıyor
      setSonTranscript('Mikrofon meşgul, bekleniyor...');
      setDur('bekliyor');
      planlaRestart(CAPTURE_RETRY_MS);
      return;
    }

    if (e.error === 'network') {
      // İnternet bağlantısı yok
      setSonTranscript('Bağlantı hatası, yeniden deneniyor...');
      setDur('bekliyor');
      planlaRestart(NETWORK_RETRY_MS);
      return;
    }

    // no-speech / busy / diğer → normal yeniden başlatma
    if (!r.current.wakeAktif) setSonTranscript('"pera" deyin...');
    planlaRestart();
  });

  useSpeechRecognitionEvent('end', () => {
    console.log('[PERA-SR] event: end');
    r.current.calisiyor = false;
    if (r.current.etkin) planlaRestart();
  });

  // ── etkin değişince başlat/durdur ─────────────────────────────────────────
  useEffect(() => {
    r.current.etkin = etkin;
    if (etkin) {
      wakeTemizle();
      baslatRef.current?.();
    } else {
      if (r.current.restartTimer) { clearTimeout(r.current.restartTimer); r.current.restartTimer = null; }
      wakeTimerTemizle();
      r.current.calisiyor = false;
      r.current.wakeAktif = false;
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
      setDur('kapali');
      setSonTranscript('');
    }
    return () => {
      r.current.etkin = false;
      if (r.current.restartTimer) { clearTimeout(r.current.restartTimer); r.current.restartTimer = null; }
      wakeTimerTemizle();
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
    };
  }, [etkin, wakeTemizle, wakeTimerTemizle]); // eslint-disable-line react-hooks/exhaustive-deps

  return { durum, sonTranscript, konusmaModunuAc };
}

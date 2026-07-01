import { useRef, useEffect, useState, useCallback } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type DinlemeDurum = 'kapali' | 'bekliyor' | 'konusuyor' | 'isleniyor';

const LOCALE = 'tr-TR';
const RESTART_GECIKME_MS = 800;
const NETWORK_RETRY_MS   = 4000;
const CAPTURE_RETRY_MS   = 6000;
const WAKE_ZAMAN_ASIMI   = 5000; // "pera" duyulduktan sonra komut için bekleme süresi

const ERP_TERIMLER = [
  'pera', 'sipariş', 'fatura', 'stok', 'ürün', 'müşteri', 'cari',
  'parça', 'sevkiyat', 'teslim', 'bakiye', 'depo', 'satış',
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
) {
  const [durum, setDurum]                 = useState<DinlemeDurum>('kapali');
  const [sonTranscript, setSonTranscript] = useState('');

  const r = useRef({
    etkin:           false,
    calisiyor:       false,
    wakeAktif:       false,
    restartTimer:    null as ReturnType<typeof setTimeout> | null,
    wakeTimer:       null as ReturnType<typeof setTimeout> | null,
  });

  const onSoruRef = useRef(onSoru);
  onSoruRef.current = onSoru;

  const setDur = useCallback((d: DinlemeDurum) => setDurum(d), []);

  const wakeTimerTemizle = useCallback(() => {
    if (r.current.wakeTimer) {
      clearTimeout(r.current.wakeTimer);
      r.current.wakeTimer = null;
    }
  }, []);

  const wakeAktifYap = useCallback(() => {
    wakeTimerTemizle();
    r.current.wakeAktif = true;
    // 5 saniye içinde komut gelmezse "pera" bekleme moduna dön
    r.current.wakeTimer = setTimeout(() => {
      r.current.wakeAktif = false;
      r.current.wakeTimer = null;
      if (r.current.etkin) setSonTranscript('"pera" deyin...');
    }, WAKE_ZAMAN_ASIMI);
  }, [wakeTimerTemizle]);

  const wakeTemizle = useCallback(() => {
    wakeTimerTemizle();
    r.current.wakeAktif = false;
  }, [wakeTimerTemizle]);

  // ── Recognizer başlat ──────────────────────────────────────────────────────
  const baslatRef = useRef<(() => Promise<void>) | undefined>(undefined);
  baslatRef.current = async () => {
    const st = r.current;
    if (!st.etkin || st.calisiyor) return;

    // Cihaz desteği kontrolü
    try {
      const servisler = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      if (servisler.length === 0) {
        setSonTranscript('Konuşma tanıma bu cihazda desteklenmiyor');
        setDur('kapali');
        return;
      }
    } catch {}

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

    const { wake, komut } = wakeAyikla(temiz);
    console.log('[PERA-SR] final:', JSON.stringify(temiz), 'wake:', wake, 'komut:', JSON.stringify(komut), 'wakeAktif:', st.wakeAktif);

    if (wake && komut) {
      wakeTemizle();
      setDur('isleniyor');
      setSonTranscript(`▶ ${komut}`);
      onSoruRef.current(komut);
    } else if (wake && !komut) {
      wakeAktifYap();
      setSonTranscript('Pera? — komutu söyleyin');
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

  return { durum, sonTranscript };
}

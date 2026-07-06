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
// SESSİZLİK TESPİTİYLE FİNAL SONUÇ ZORLAMA: expo-speech-recognition'ın stop() (nazikçe
// bitir, final sonucu DÖNDÜR) ve abort() (iptal et, sonuç DÖNDÜRME) diye iki ayrı
// fonksiyonu var. Bazı Android/OEM (canlı testte Xiaomi/MIUI'de doğrulandı) konuşma
// tanıma implementasyonları, "continuous" modda bile, kullanıcı sessiz kalınca final
// sonucu KENDİLİĞİNDEN ÜRETMİYOR (hatta stop() çağrılsa bile) — sadece ara (interim)
// transkriptler birikip sonra sessizce 'end' event'i geliyor, söylenen hiçbir şey
// işlenmiyor. Çözüm: son interim sonuçtan bu kadar süre geçip yeni bir şey gelmezse
// elimizdeki son interim'i KENDİMİZ final sonuç gibi işliyoruz (bkz. bekleyenInterimiIsle).
// SÜRE NOTU: ilk denemede 1300ms ile canlı testte (iOS) "Pera bu", "Pera bekl" gibi
// cümlenin ortasında ERKEN KESİLDİĞİ görüldü (kullanıcı "Pera" deyip kısa bir duraklama
// yapınca hemen final sayılıyordu) — 2000ms'e çıkarıldı. Canlı testte 2000ms'de de
// AYNI SINIF sorun tekrar görüldü: ikinci soruda ("Son bir ayda...") kullanıcı doğal
// bir duraklama yapınca cümle tamamlanmadan finalize edildi. Gerçek konuşmada kelime
// arası/cümle ortası duraklamalar 2sn'yi rahatça geçebiliyor — ChatGPT'nin sesli
// modundaki gibi daha cömert bir eşik gerekiyor, 3000ms'e çıkarıldı.
const SESSIZLIK_STOP_MS = 3000;
// ONAY SESİ BİTTİKTEN SONRA KORUMA SÜRESİ: canlı testte (iOS), onay ifadesi
// ("Evet, dinliyorum" vb.) TAM BİTTİĞİ ANDA dinlemeyi tekrar açmak yetmedi — sesin
// kuyruğu/yankısı (oda akustiği, hoparlör-mikrofon mesafesi) hâlâ havada asılı
// kalıp yeni açılan oturum tarafından yakalanabiliyordu. ChatGPT'nin sesli modunda
// da benzer bir "konuşma bitince hemen dinleme" değil, kısa bir tampon süre olduğu
// gözlemine dayanarak eklendi.
const ONAY_KORUMA_MS = 400;
// İÇERİK BAZLI YANKI TESPİTİ (kalıcı çözüm): süre sabitleri (SESSIZLIK_STOP_MS,
// ONAY_KORUMA_MS) ne kadar ince ayarlanırsa ayarlansın, tanıma motorunun kendi iç
// gecikmesi (final sonucu birkaç yüz ms-birkaç sn geç teslim etmesi) yüzünden
// PERA'nın kendi sesi hâlâ yeni komut sanılabiliyordu (canlı testte "Hazırım,
// buyurun" gibi TAM OLARAK PERA'nın kendi söylediği bir onay ifadesi kullanıcı
// sormuş gibi işlendi). Süreye güvenmek yerine PERA'nın TAM OLARAK NE SÖYLEDİĞİNİ
// (metin olarak biliyoruz, kendimiz üretiyoruz) tanınan sonuçla karşılaştırıyoruz;
// örtüşüyorsa yankı kabul edilip yok sayılıyor — zamanlamadan bağımsız, çok daha
// güvenilir bir savunma katmanı.
const YANKI_PENCERE_MS = 4000; // PERA konuşmayı bitirdikten sonra da içerik-eşleşen sonuçlar bu süre boyunca yankı sayılır

function normalizeMetin(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// tanınan metin PERA'nın söylediğinin bir parçası mı (ya da tam tersi, kısa onay
// ifadelerinde) — ya da kelimelerin büyük kısmı örtüşüyor mu (STT parça parça/
// bozuk yakalamış olabilir, tam alt dize eşleşmesi her zaman olmayabilir).
function metinYankiMi(tanınan: string, soylenen: string): boolean {
  const a = normalizeMetin(soylenen);
  const b = normalizeMetin(tanınan);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aKelimeler = new Set(a.split(' '));
  const bKelimeler = b.split(' ').filter(Boolean);
  if (!bKelimeler.length) return false;
  const ortakSayisi = bKelimeler.filter((k) => aKelimeler.has(k)).length;
  return ortakSayisi / bKelimeler.length >= 0.7;
}

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
    sessizlikTimer:  null as ReturnType<typeof setTimeout> | null,
    onayKorumaTimer: null as ReturnType<typeof setTimeout> | null,
    sonInterim:      '', // en son ara (interim) transkript — bkz. sessizlikTimerKur notu
    onayOkunuyor:    false, // "Hey Pera" onay ifadesi ("Buyurun" vb.) şu an TTS ile çalıyor mu
    sonSoylenenMetin: '', // PERA'nın şu an (veya en son) söylediği tam metin — içerik bazlı yankı tespiti için
    sonSoylenenBitisMs: 0, // PERA'nın konuşmayı bitirdiği zaman — YANKI_PENCERE_MS penceresi bunun üzerinden hesaplanır
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

  // "Hey Pera" onay ifadesi ("Buyurun" vb.) TTS ile çalarken cihaz kendi sesini
  // (yankı, gerçek AEC olmadığı için) yeni bir komut sanabiliyordu (canlı testte
  // "Buyrun sorunuzu alayım" ifadesinin kendisi bir sonraki soru gibi işlendiği
  // görüldü) — ChatScreen bu onay ifadesini seslendirirken true, bitince false
  // çağırır; true olduğu sürece HİÇBİR sonuç işlenmez (bkz. sonucIsleRef).
  const onayDurumunuAyarla = useCallback((aktif: boolean) => {
    if (r.current.onayKorumaTimer) { clearTimeout(r.current.onayKorumaTimer); r.current.onayKorumaTimer = null; }
    if (aktif) {
      r.current.onayOkunuyor = true;
    } else {
      // Hemen kapatma — kısa bir koruma süresi sonra kapat (bkz. ONAY_KORUMA_MS notu).
      r.current.onayKorumaTimer = setTimeout(() => {
        r.current.onayKorumaTimer = null;
        r.current.onayOkunuyor = false;
      }, ONAY_KORUMA_MS);
    }
  }, []);

  // PERA konuşmaya BAŞLARKEN tam metinle (metin), BİTİRİNCE null ile çağrılır —
  // null çağrısı sadece bitiş zamanını damgalar (sonSoylenenMetin öylece kalır,
  // YANKI_PENCERE_MS boyunca hâlâ karşılaştırma için kullanılabilsin diye silinmez).
  const konusulanMetniAyarla = useCallback((metin: string | null) => {
    if (metin !== null) {
      r.current.sonSoylenenMetin = metin;
    } else {
      r.current.sonSoylenenBitisMs = Date.now();
    }
  }, []);

  const wakeTemizle = useCallback(() => {
    wakeTimerTemizle();
    r.current.wakeAktif = false;
  }, [wakeTimerTemizle]);

  const sessizlikTimerTemizle = useCallback(() => {
    if (r.current.sessizlikTimer) {
      clearTimeout(r.current.sessizlikTimer);
      r.current.sessizlikTimer = null;
    }
  }, []);

  // Son ara (interim) sonuçtan bu kadar süre geçip yeni bir şey gelmezse: ÖNCE stop()
  // dener (bazı cihazlarda gerçekten final sonuç üretir), AMA canlı testte (Xiaomi/MIUI)
  // stop() bile final sonuç üretmeden sessizce session'ı bitirdiği görüldü — bu yüzden
  // native finalizasyona GÜVENMEK YERİNE, elimizdeki SON ARA TRANSKRİPTİ kendimiz final
  // sonuç gibi işliyoruz (abort() ile session'ı temiz kapatıp sonucIsleRef'e veriyoruz).
  // Gerçek bir isFinal:true event'i BU SAYAÇ ATEŞLENMEDEN önce gelirse (bazı cihazlarda
  // normal çalışır) zaten kendi yolundan işlenir ve bu sayaç temizlenir — çift işleme
  // riski yok (abort() sonrası başka event beklenmez).
  // Bekleyen (varsa) son ara transkripti final sonuç gibi işler. Hem sessizlik
  // sayacından hem de (sayaç ateşlenmeden native session bitmiş olabileceği ihtimaline
  // karşı, güvenlik amaçlı) 'end' event handler'ından çağrılır — sonInterim işlendikten
  // hemen sonra temizlendiği için çift çağrıda ikinci çağrı hiçbir şey yapmaz.
  const bekleyenInterimiIsle = useCallback(() => {
    const bekleyenTranskript = r.current.sonInterim;
    r.current.sonInterim = '';
    if (bekleyenTranskript) {
      console.log('[PERA-SR] bekleyen ara sonuç final olarak işleniyor:', JSON.stringify(bekleyenTranskript));
      sonucIsleRef.current?.(bekleyenTranskript);
    }
  }, []);

  const sessizlikTimerKur = useCallback(() => {
    sessizlikTimerTemizle();
    r.current.sessizlikTimer = setTimeout(() => {
      r.current.sessizlikTimer = null;
      if (r.current.calisiyor && r.current.sonInterim) {
        console.log('[PERA-SR] sessizlik tespit edildi, session temiz kapatılıyor');
        try { ExpoSpeechRecognitionModule.abort(); } catch {}
        bekleyenInterimiIsle();
      }
    }, SESSIZLIK_STOP_MS);
  }, [sessizlikTimerTemizle, bekleyenInterimiIsle]);

  // ── Recognizer başlat ──────────────────────────────────────────────────────
  const baslatRef = useRef<(() => Promise<void>) | undefined>(undefined);
  baslatRef.current = async () => {
    const st = r.current;
    if (!st.etkin || st.calisiyor) return;
    // await'lerden önce senkron kilitleniyor — aksi halde start() üst üste iki kez
    // çağrılabiliyordu (calisiyor flag'i eskiden await requestPermissionsAsync()'ten
    // SONRA set ediliyordu; iki çağrı da bu await bitmeden gelirse ikisi de guard'ı
    // geçip aynı anda iki recognizer session başlatıyordu — canlı testte iOS'ta art
    // arda iki "start() çağrıldı" logu bununla doğrulandı, mikrofonun açılıp
    // kapanması sanılan davranış aslında bu çakışan session'lardı).
    st.calisiyor = true;

    // Cihaz desteği kontrolü — getSpeechRecognitionServices() SADECE ANDROID'E ÖZEL
    // (paket adı listesi döndürür); iOS'ta bu liste HER ZAMAN boş dönüyor, bu yüzden
    // Android dışında çalıştırılırsa iOS'ta "desteklenmiyor" diyip özelliği tamamen
    // engelliyordu (canlı testte tam da bu şekilde ortaya çıktı — iOS'ta konuşma
    // tanıma normalde Apple'ın kendi Speech framework'ü üzerinden gayet destekleniyor).
    if (Platform.OS === 'android') {
      try {
        const servisler = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
        console.log('[PERA-SR] mevcut servisler:', JSON.stringify(servisler));
        if (servisler.length === 0) {
          st.calisiyor = false;
          setSonTranscript('Konuşma tanıma bu cihazda desteklenmiyor');
          setDur('kapali');
          return;
        }
      } catch (e) {
        console.log('[PERA-SR] getSpeechRecognitionServices HATA:', e instanceof Error ? e.message : String(e));
      }
    }

    const izin = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    console.log('[PERA-SR] izin durumu:', JSON.stringify(izin));
    if (!izin.granted) {
      st.calisiyor = false;
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
      console.log('[PERA-SR] start() çağrıldı');
    } catch (e) {
      st.calisiyor = false;
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

    // "Hey Pera" onay ifadesi ("Buyurun" vb.) şu an TTS ile çalıyorsa gelen HİÇBİR
    // sonuç işlenmez — kısa/sabit bir ifade olduğu için barge-in'e bile izin
    // vermeye değmez, cihazın kendi sesini duyup yeni komut sanması riski daha ağır basar.
    if (st.onayOkunuyor) {
      console.log('[PERA-SR] onay ifadesi okunurken gelen sonuç yok sayıldı:', JSON.stringify(temiz));
      return;
    }

    // İÇERİK BAZLI YANKI TESPİTİ: PERA konuşuyorsa YA DA yakın zamanda konuşmayı
    // bitirdiyse (YANKI_PENCERE_MS), tanınan metin PERA'nın söylediğiyle örtüşüyorsa
    // bu kesinlikle cihazın kendi sesini duyması — süre sabitlerinden bağımsız,
    // içeriğe dayalı olduğu için çok daha güvenilir (bkz. YANKI_PENCERE_MS notu).
    const yakinZamandaKonustu = Date.now() - st.sonSoylenenBitisMs < YANKI_PENCERE_MS;
    if ((st.peraKonusuyorMu || yakinZamandaKonustu) && metinYankiMi(temiz, st.sonSoylenenMetin)) {
      console.log('[PERA-SR] içerik bazlı yankı tespit edildi, yok sayıldı:', JSON.stringify(temiz));
      return;
    }

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

  // TANI AMAÇLI (geçici): mikrofon donanımı gerçekten ses alıyor mu, yoksa hiç
  // tetiklenmiyor mu ayırt etmek için — 'result' hiç gelmese bile bu event'lerin
  // gelip gelmediği "ses donanıma ulaşıyor mu" sorusunu ayrı test eder.
  useSpeechRecognitionEvent('audiostart', () => console.log('[PERA-SR] event: audiostart (mikrofon donanımı aktif)'));
  useSpeechRecognitionEvent('soundstart', () => console.log('[PERA-SR] event: soundstart (ses algılandı)'));
  useSpeechRecognitionEvent('speechstart', () => console.log('[PERA-SR] event: speechstart (konuşma algılandı)'));

  useSpeechRecognitionEvent('result', (e) => {
    if (!r.current.etkin) return;
    const transcript = e.results?.[0]?.transcript ?? '';
    console.log('[PERA-SR] result event, isFinal:', e.isFinal, 'transcript:', JSON.stringify(transcript));
    if (!transcript) return;
    if (e.isFinal) {
      sessizlikTimerTemizle();
      r.current.sonInterim = '';
      sonucIsleRef.current?.(transcript);
    } else {
      setDur('konusuyor');
      setSonTranscript(transcript);
      r.current.sonInterim = transcript;
      // Her yeni ara sonuçta sayaç sıfırdan başlar — kullanıcı konuşmaya devam
      // ettiği sürece stop() tetiklenmez, ancak SESSIZLIK_STOP_MS boyunca yeni
      // bir şey gelmezse (konuşma bitti demektir) final sonuç zorla istenir.
      sessizlikTimerKur();
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    console.log('[PERA-SR] event: error', e.error, e.message);
    r.current.calisiyor = false;
    sessizlikTimerTemizle();
    r.current.sonInterim = '';

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
    sessizlikTimerTemizle();
    // GÜVENLİK AĞI: session, sessizlik sayacı hiç ateşlenmeden bitmiş olabilir (ör.
    // native taraf beklenenden erken sonlandırdıysa) — elde ara sonuç varsa yine de
    // işle, aksi halde söylenen tamamen kaybolur.
    bekleyenInterimiIsle();
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
      sessizlikTimerTemizle();
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
      sessizlikTimerTemizle();
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
    };
  }, [etkin, wakeTemizle, wakeTimerTemizle, sessizlikTimerTemizle]); // eslint-disable-line react-hooks/exhaustive-deps

  return { durum, sonTranscript, konusmaModunuAc, onayDurumunuAyarla, konusulanMetniAyarla };
}

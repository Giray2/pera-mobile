import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../hooks/useChat';
import { useSurekliDinleme } from '../hooks/useSurekliDinleme';
import { MessageBubble } from '../components/MessageBubble';
import { TypingIndicator } from '../components/TypingIndicator';
import { ENV } from '../config/env';
import type { Mesaj, SohbetKayit } from '../hooks/useChat';

const HIZLI_SORULAR = [
  'Bu ayın en çok satan ürünleri neler?',
  'Vadesi geçmiş faturalar hangileri?',
  'Stok seviyesi kritik olan ürünler?',
  'Bu hafta gelen siparişler?',
  'En çok alım yapan müşteriler?',
];

// BEKLETME İFADESİ: eller serbest modda ekrana bakılmadığı için, cevap backend/LLM
// tarafında birkaç saniye sürünce (canlı testte 10-13sn gözlendi) kullanıcı sessizliği
// "donmuş/çalışmıyor" sanıp uygulamayı kapatabiliyordu. BEKLETME_ESIK_MS içinde cevap
// gelmezse kısa bir sesli "bakıyorum" ifadesi çalınır — cache'ten anında gelen cevaplarda
// (BEKLETME_ESIK_MS'den kısa sürede) hiç tetiklenmez, gereksiz kesintiye sebep olmaz.
const BEKLETME_ESIK_MS = 1500;
const BEKLETME_IFADELERI = [
  'Bakıyorum, bir saniye...',
  'Hemen kontrol ediyorum...',
  'Bir saniye, hazırlıyorum...',
  'Şimdi bakıyorum...',
];

function ttsMetnHazirla(metin: string): string {
  let t = metin
    // EMOJİ TEMİZLE: TTS motoru (özellikle iOS) emojiyi görünce açıklamasını
    // ("çizgi grafiği", "onay işareti" vb.) sesli okuyor — TTS'e hiç gitmemeli.
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\*\*/g, '').replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '').replace(/[-•]\s/g, '')
    .replace(/\bTL\b/g, 'Türk Lirası')
    .replace(/\bKDV\b/g, 'K D V')
    // ESKİDEN her 2-5 harfli BÜYÜK HARF kelimeyi (ör. SÜTAŞ, ürün kodları) harf harf
    // okutuyordu — kaldırıldı, sadece yukarıdaki bilinen kısaltmalar özel işlenir.
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length <= 420) return t;
  const nokta = t.indexOf('. ', 80);
  return nokta > 0 && nokta < 420 ? t.substring(0, nokta + 1) : t.substring(0, 420) + '...';
}

interface DrawerProps {
  gecmis: SohbetKayit[];
  onSec: (mesajlar: Mesaj[]) => void;
  onKapat: () => void;
}

function GecmisDrawer({ gecmis, onSec, onKapat }: DrawerProps) {
  return (
    <>
      <TouchableOpacity style={s.dimmer} activeOpacity={1} onPress={onKapat} />
      <View style={s.drawer}>
        <View style={s.drawerHeader}>
          <Text style={s.drawerBaslik}>Geçmiş Sohbetler</Text>
          <TouchableOpacity onPress={onKapat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.drawerKapat}>✕</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={gecmis}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.gecmisItem} onPress={() => { onSec(item.mesajlar); onKapat(); }}>
              <Text style={s.gecmisOzet} numberOfLines={2}>{item.ozet}</Text>
              <Text style={s.gecmisTarih}>
                {new Date(item.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={s.ayrac} />}
          ListEmptyComponent={<Text style={s.bosText}>Henüz kayıtlı sohbet yok.</Text>}
        />
      </View>
    </>
  );
}

export default function ChatScreen() {
  const { kullanici, cikisYap } = useAuth();
  const insets = useSafeAreaInsets();
  const [yazilan, setYazilan] = useState('');
  const [sesliMod, setSesliMod] = useState(true);
  const [konusuyor, setKonusuyor] = useState(false);
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const [surekliMod, setSurekliMod] = useState(false);
  const listRef = useRef<FlatList<Mesaj>>(null);

  const {
    mesajlar, setMesajlar, yukleniyor,
    gecmis, gecmisYukle, yeniSohbet, sor, tekrarDene,
  } = useChat();

  // AŞAMA 2 (sunucu TTS): PERA-API /api/tts/seslendir üzerinden Microsoft Edge Neural
  // Türkçe ses (tr-TR-EmelNeural/AhmetNeural) — cihaz TTS'sine göre özellikle Android'de
  // çok daha tutarlı/doğal. audioPlayerRef aktifken sesDurdur bunu durdurur; sunucu
  // başarısız olursa (mikroservis henüz ayakta değilse vb.) AŞAMA 1'e (expo-speech,
  // aşağıdaki sesCihazdaOku) otomatik düşülür.
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  // playbackStatusUpdate dinleyicisi — sesDurdur da bunu temizlemeli, yoksa
  // remove() edilmiş bir player'a bağlı "yetim" dinleyici birikir (uzun sürekli-mod
  // oturumlarında listener leak riski).
  const dinleyiciRef = useRef<{ remove: () => void } | null>(null);
  // Hızlı art arda sesliOku çağrılarında (ör. barge-in ile üst üste soru) önceki
  // çağrının async (SecureStore/network) kısmı geç tamamlanırsa "eski" player'ın
  // play()/bitti() çalışmasını engellemek için nesil sayacı.
  const sesliOkuIdRef = useRef(0);

  // sesDurdur ve sesliOku önce tanımlanıyor (sorVeTTS bağımlı)
  const sesDurdur = useCallback(() => {
    Speech.stop();
    sesliOkuIdRef.current += 1; // her türlü askıdaki eski çağrıyı geçersiz kıl
    if (dinleyiciRef.current) {
      try { dinleyiciRef.current.remove(); } catch {}
      dinleyiciRef.current = null;
    }
    if (audioPlayerRef.current) {
      try { audioPlayerRef.current.pause(); audioPlayerRef.current.remove(); } catch {}
      audioPlayerRef.current = null;
    }
    setKonusuyor(false);
    // GÜVENLİK: sunucu-TTS yolunda çalan bir onay/bekletme ifadesi buradan kesilirse
    // o çağrının bitti()'si HİÇ çalışmaz → onayOkunuyor bayrağı true'da takılı kalır
    // ve dinleyici tüm sonuçları sonsuza dek yok sayar (uygulama "sağırlaşır").
    // Kesinti her zaman onay durumunu da kapatır (400ms'lik korumalı kapanış).
    onayDurumunuAyarlaRef.current(false);
  }, []);

  const konusuyorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // KONUŞMA MODU: useSurekliDinleme'nin konusmaModunuAc'ı henüz tanımlanmadan
  // (aşağıda) sesliOku burada oluşturuluyor — ref ile "ileri referans" çözülüyor.
  const konusmaModunuAcRef = useRef<() => void>(() => {});
  // "Hey Pera" onay ifadesi çalarken dinleyicinin cihazın kendi sesini yeni komut
  // sanmaması için — sesliOku bunu true/false çağırır (bkz. onayDurumunuAyarla notu).
  const onayDurumunuAyarlaRef = useRef<(aktif: boolean) => void>(() => {});
  // İçerik bazlı yankı tespiti (bkz. useSurekliDinleme/konusulanMetniAyarla notu) —
  // PERA'nın TAM OLARAK ne söylediğini (onay ifadesi VEYA normal cevap, ikisi de)
  // dinleyiciye bildirir, süre sabitlerinden bağımsız daha güvenilir bir savunma.
  const konusulanMetniAyarlaRef = useRef<(metin: string | null) => void>(() => {});
  const surekliModRef = useRef(surekliMod);
  surekliModRef.current = surekliMod;

  // En doğal Türkçe TTS sesini seç (Google'ın network/enhanced sesleri tercih)
  const enIyiSesRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    (async () => {
      try {
        const sesler = await Speech.getAvailableVoicesAsync();
        const tr = sesler.filter((v) => v.language?.toLowerCase().startsWith('tr'));
        console.log('[PERA-TTS] Türkçe sesler:', JSON.stringify(
          tr.map((v) => ({ id: v.identifier, q: v.quality, n: v.name })),
        ));
        // Öncelik: network (Asistan benzeri HD) > Enhanced kalite > ilk tr ses
        const network = tr.find((v) => /network/i.test(v.identifier));
        const enhanced = tr.find((v) => v.quality === Speech.VoiceQuality.Enhanced);
        const secilen = network ?? enhanced ?? tr[0];
        enIyiSesRef.current = secilen?.identifier;
        console.log('[PERA-TTS] seçilen ses:', enIyiSesRef.current);
      } catch (e) {
        console.log('[PERA-TTS] ses listesi hatası:', e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // AŞAMA 1 (cihaz TTS, fallback): sunucu TTS'ine ulaşılamazsa (mikroservis kapalı,
  // ağ hatası vb.) buraya düşülür — mevcut expo-speech davranışı aynen korunuyor.
  const sesCihazdaOku = useCallback((metinHazir: string, bitti: () => void) => {
    Speech.speak(metinHazir, {
      language: 'tr-TR', voice: enIyiSesRef.current, pitch: 1.0, rate: 1.05,
      onDone: bitti,
      onStopped: bitti,
      onError: bitti,
    });
  }, []);

  // onayMi=true: "Hey Pera" tek başına söylenince çalınan kısa onay ifadesi ("Buyurun"
  // vb.) — bu süre boyunca dinleyici gelen HİÇBİR sonucu işlemez (bkz.
  // onayDurumunuAyarla notu), cihazın kendi sesini yeni komut sanması engellenir.
  // bekletmeMi=true: cevap beklerken çalınan kısa "Bakıyorum..." ifadesi — bittiğinde
  // konuşma modu AÇILMAMALI (cevap hâlâ backend'de; ekran "Cevabınız hazırlanıyor..."da
  // kalmalı ve 18sn'lik soru penceresi yanlış yere açılmamalı).
  const sesliOku = useCallback(async (metin: string, onayMi: boolean = false, bekletmeMi: boolean = false) => {
    sesDurdur();
    const cagriId = ++sesliOkuIdRef.current; // sesDurdur zaten +1 yaptı ama emin olmak için burada da artır
    if (konusuyorTimerRef.current) clearTimeout(konusuyorTimerRef.current);
    const metinHazir = ttsMetnHazirla(metin);
    setKonusuyor(true);
    konusulanMetniAyarlaRef.current(metinHazir);
    if (onayMi) onayDurumunuAyarlaRef.current(true);

    let zatenBitti = false; // bitti() birden fazla yoldan (timeout/error/didJustFinish) tetiklenebilir — idempotent yap
    const bitti = () => {
      if (zatenBitti) return;
      zatenBitti = true;
      if (konusuyorTimerRef.current) { clearTimeout(konusuyorTimerRef.current); konusuyorTimerRef.current = null; }
      if (audioPlayerRef.current) audioPlayerRef.current = null;
      dinleyiciRef.current = null;
      setKonusuyor(false);
      konusulanMetniAyarlaRef.current(null);
      if (onayMi) onayDurumunuAyarlaRef.current(false);
      // KONUŞMA MODU: PERA cevabını bitirince, sürekli mod açıksa kullanıcı "pera"
      // demeden 18 saniye içinde devam sorusu sorabilsin. (Bekletme ifadesinde açılmaz
      // — bkz. bekletmeMi notu.)
      if (surekliModRef.current && !bekletmeMi) konusmaModunuAcRef.current();
    };
    const zamanAsimindaBitir = () => {
      if (cagriId === sesliOkuIdRef.current) bitti();
    };
    // maksimum 30 sn sonra her durumda sıfırla — cihaz TTS'e düşüldüğünde de
    // (aşağıda) yeniden kurulur, tek bir "toplam konuşma" süresi garanti edilir.
    konusuyorTimerRef.current = setTimeout(zamanAsimindaBitir, 30000);

    const buCagriGecerliMi = () => cagriId === sesliOkuIdRef.current;

    const cihazaDus = () => {
      if (!buCagriGecerliMi()) return; // sesDurdur/yeni bir sesliOku çağrısı bu çağrıyı zaten geçersiz kıldı
      if (konusuyorTimerRef.current) clearTimeout(konusuyorTimerRef.current);
      konusuyorTimerRef.current = setTimeout(zamanAsimindaBitir, 30000);
      sesCihazdaOku(metinHazir, bitti);
    };

    try {
      const token = await SecureStore.getItemAsync(ENV.TOKEN_KEY);
      if (!buCagriGecerliMi()) return; // beklerken sesDurdur/yeni soru geldi, bu çağrı artık geçersiz
      const url = `${ENV.API_BASE_URL}/api/tts/seslendir?metin=${encodeURIComponent(metinHazir)}`;
      const player = createAudioPlayer({
        uri: url,
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'X-Firma-No': ENV.FIRMA_NO,
          'X-Donem-No': ENV.DONEM_NO,
        },
      });
      audioPlayerRef.current = player;
      const dinleyici = player.addListener('playbackStatusUpdate', (status) => {
        if (!buCagriGecerliMi()) return; // eski çağrı — sesDurdur zaten player/dinleyiciyi temizledi
        if (status.error) {
          console.log('[PERA-TTS] sunucu TTS hatası, cihaz TTS\'ine düşülüyor:', status.error);
          dinleyici.remove();
          dinleyiciRef.current = null;
          try { player.remove(); } catch {}
          if (audioPlayerRef.current === player) audioPlayerRef.current = null;
          cihazaDus();
          return;
        }
        if (status.didJustFinish) {
          dinleyici.remove();
          dinleyiciRef.current = null;
          try { player.remove(); } catch {}
          if (audioPlayerRef.current === player) bitti();
        }
      });
      dinleyiciRef.current = dinleyici;
      await setAudioModeAsync({ playsInSilentMode: true });
      if (!buCagriGecerliMi()) { try { player.remove(); } catch {} return; }
      player.play();
    } catch (e) {
      console.log('[PERA-TTS] sunucu TTS başlatılamadı, cihaz TTS\'ine düşülüyor:', e instanceof Error ? e.message : String(e));
      cihazaDus();
    }
  }, [sesDurdur, sesCihazdaOku]);

  // TTS wrapper'lar — cevap gelince sesliMod aktifse otomatik okur
  const sesliModRef = useRef(sesliMod);
  sesliModRef.current = sesliMod;

  const sorVeTTS = useCallback(async (metin: string) => {
    sesDurdur();
    let cevapGeldi = false;
    const bekletmeTimer = setTimeout(() => {
      if (!cevapGeldi && sesliModRef.current) {
        const ifade = BEKLETME_IFADELERI[Math.floor(Math.random() * BEKLETME_IFADELERI.length)];
        sesliOku(ifade, true, true);
      }
    }, BEKLETME_ESIK_MS);
    const cevap = await sor(metin);
    cevapGeldi = true;
    clearTimeout(bekletmeTimer);
    if (cevap && sesliModRef.current) {
      sesliOku(cevap);
    } else if (!cevap && sesliModRef.current) {
      // SESLİ HATA BİLDİRİMİ: eller serbest modda kullanıcı ekrana bakmıyor —
      // backend hatası/boş cevap sessizce yutulursa "cevap vermedi" olarak
      // yaşanıyor (canlı testte 2. sorunun cevabı böyle kayboldu). Hata da
      // sesli okunur; bitti()'si konuşma modunu açar, kullanıcı hemen tekrar sorabilir.
      sesliOku('Üzgünüm, bir sorun oluştu. Lütfen sorunuzu tekrar sorar mısınız?');
    } else if (surekliModRef.current) {
      // Sesli mod kapalıyken 'isleniyor' durumunu çöz — dinleme çubuğu
      // "Cevabınız hazırlanıyor..."da takılı kalmasın.
      konusmaModunuAcRef.current();
    }
  }, [sor, sesliOku, sesDurdur]);

  // TEK MİKROFON: önceden ayrı bir "bas-konuş" (push-to-talk) butonu da vardı —
  // kullanıcı isteğiyle kaldırıldı, tek ses girişi yolu artık sürekli/eller-serbest
  // mod (surekliMod). Kullanıcı istediğinde zaten dokunup durdurabiliyor (header
  // mikrofon ikonu / "PERA konuşuyor" çubuğu), ayrı bir moda gerek yok.
  // BARGE-IN: !konusuyor KALDIRILDI — PERA konuşurken de dinleyici çalışmaya devam
  // etmeli ki kullanıcı araya girip konuşabilsin (aşağıdaki peraKonusuyorMu/onKesinti
  // ile useSurekliDinleme bunu "kesinti" olarak işler, wake-word aramaz).
  // !yukleniyor DA KALDIRILDI: dinleyici her soru cevaplanırken (yukleniyor true/false
  // olunca) abort edilip hemen yeniden başlatılıyordu — native abort() asenkron olduğu
  // için hemen ardından gelen start() çağrısı bazen sessizce takılıp kalıyordu (canlı
  // testte "ikinci sorudan sonra kilitlenme" olarak gözlemlendi). Artık dinleyici
  // sadece kullanıcı sürekli modu açıp kapatınca başlıyor/duruyor, soru-cevap döngüsü
  // boyunca HİÇ abort edilmiyor.
  const { durum: dinlemeDurum, sonTranscript, konusmaModunuAc, onayDurumunuAyarla, konusulanMetniAyarla } = useSurekliDinleme(
    sorVeTTS,
    surekliMod,
    konusuyor,
    sesDurdur,
    // "Hey Pera" tek başına söylenince sesli onay — kullanıcı wake-word'ün
    // duyulduğunu (yalnızca ekran metninden değil) sesle de anlasın. onayMi=true:
    // bu ifade çalarken cihazın kendi sesini yeni komut sanmasını engeller.
    (ifade) => { sesliOku(ifade, true); },
  );
  konusmaModunuAcRef.current = konusmaModunuAc;
  onayDurumunuAyarlaRef.current = onayDurumunuAyarla;
  konusulanMetniAyarlaRef.current = konusulanMetniAyarla;

  useEffect(() => { gecmisYukle(); }, [gecmisYukle]);

  useEffect(() => {
    if (mesajlar.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [mesajlar]);

  const gonder = useCallback(async () => {
    const metin = yazilan.trim();
    if (!metin || yukleniyor) return;
    setYazilan('');
    Keyboard.dismiss(); // Android'de gönderince klavye acik kalip icerigin ustunde durmasin
    sesDurdur();
    const cevap = await sor(metin);
    if (cevap && sesliModRef.current) sesliOku(cevap);
  }, [yazilan, yukleniyor, sor, sesliOku, sesDurdur]);

  const handleYeniSohbet = () => {
    Alert.alert('Yeni Sohbet', 'Mevcut sohbet geçmişe kaydedilip temizlenecek.', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Temizle', onPress: () => { sesDurdur(); yeniSohbet(); } },
    ]);
  };

  const bos = mesajlar.length === 0 && !yukleniyor;

  // KLAVYE DÜZELTMESİ: KeyboardAvoidingView'in 'padding' davranışı, üstteki özel
  // header'ın (safe-area + ikonlar) gerçek yüksekliğini bilmediği için input alanını
  // yanlış hesaplayıp klavyenin ALTINDA/ARKASINDA bırakıyordu (iOS'ta ekrana hiç
  // girmiyordu). Header'ın GERÇEK render edilmiş yüksekliği ölçülüp keyboardVerticalOffset
  // olarak veriliyor — sabit bir sayı tahmin etmek yerine.
  const [headerYuksekligi, setHeaderYuksekligi] = useState(0);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerYuksekligi : 0}
      style={s.container}
    >
      {/* Header */}
      <View
        style={[s.header, { paddingTop: Math.max(insets.top, 12) }]}
        onLayout={(e) => setHeaderYuksekligi(e.nativeEvent.layout.height)}
      >
        <Text style={s.headerTitle}>PERA</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setGecmisAcik(true)} style={s.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.headerBtnText}>📋</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleYeniSohbet} style={s.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.headerBtnText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSurekliMod((m) => {
            if (!m) sesDurdur();
            return !m;
          })}
          style={[s.headerBtn, surekliMod && s.headerBtnAktif]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.headerBtnText}>🎤</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { if (sesliMod) sesDurdur(); setSesliMod((m) => !m); }} style={s.headerBtn}>
          <Text style={s.headerBtnText}>{sesliMod ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={cikisYap} style={s.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.headerBtnText}>🚪</Text>
        </TouchableOpacity>
      </View>

      {/* Sürekli dinleme durum çubuğu */}
      {surekliMod && (
        <View style={[s.surekliBar, dinlemeDurum === 'konusuyor' && s.surekliBarAktif]}>
          {dinlemeDurum === 'isleniyor'
            ? <ActivityIndicator size="small" color="#4fc3f7" />
            : <Text style={s.surekliIcon}>{dinlemeDurum === 'konusuyor' ? '🔴' : '👂'}</Text>
          }
          <Text style={s.surekliText} numberOfLines={1}>
            {dinlemeDurum === 'isleniyor'
              ? 'Cevabınız hazırlanıyor...'
              : dinlemeDurum === 'konusuyor'
              ? 'Dinliyorum...'
              : sonTranscript
              ? `${sonTranscript}`
              : 'Konuşun...'}
          </Text>
          <TouchableOpacity onPress={() => setSurekliMod(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.surekliKapat}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PERA konuşuyor */}
      {konusuyor && (
        <TouchableOpacity style={s.konusuyorBar} onPress={sesDurdur} activeOpacity={0.8}>
          <ActivityIndicator size="small" color="#4fc3f7" />
          <Text style={s.konusuyorText}>PERA konuşuyor... — durdurmak için dokun</Text>
        </TouchableOpacity>
      )}

      {/* Mesajlar */}
      <FlatList
        ref={listRef}
        data={mesajlar}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            mesaj={item}
            onTekrarDene={tekrarDene}
            onSesliOku={sesliMod ? sesliOku : undefined}
          />
        )}
        contentContainerStyle={s.liste}
        ListEmptyComponent={
          bos ? (
            <View style={s.bosluk}>
              <Text style={s.boslukText}>Merhaba {kullanici?.adi || ''}!</Text>
              <Text style={s.boslukAlt}>ERP verileriniz hakkında soru sorabilirsiniz.</Text>
              <Text style={s.boslukHint}>🎤 "pera" de  ·  ✍️ yaz</Text>
            </View>
          ) : null
        }
      />

      {/* Typing */}
      {yukleniyor && (
        <View style={s.typingRow}>
          <Text style={s.avatar}>✨</Text>
          <TypingIndicator />
        </View>
      )}

      {/* Hızlı sorular */}
      {bos && (
        <View style={s.hizliContainer}>
          {HIZLI_SORULAR.map((q, i) => (
            <TouchableOpacity key={i} style={s.hizliBtn} onPress={() => sorVeTTS(q)}>
              <Text style={s.hizliText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input satırı */}
      <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={s.input}
          placeholder="Soru sorun veya 🎤 ile konuşun..."
          placeholderTextColor="#546e7a"
          value={yazilan}
          onChangeText={setYazilan}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={gonder}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!yazilan.trim() || yukleniyor) && s.sendDisabled]}
          onPress={gonder}
          disabled={!yazilan.trim() || yukleniyor}
        >
          <Text style={s.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Geçmiş drawer */}
      {gecmisAcik && (
        <GecmisDrawer
          gecmis={gecmis}
          onSec={(msgs) => setMesajlar(msgs)}
          onKapat={() => setGecmisAcik(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f1923' },
  header:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c2a36', paddingHorizontal: 14, paddingBottom: 12, gap: 4 },
  headerTitle:  { fontSize: 20, fontWeight: 'bold', color: '#4fc3f7' },
  headerBtn:    { padding: 4 },
  headerBtnText:{ fontSize: 19 },
  headerBtnAktif: { backgroundColor: '#1a3a1a', borderRadius: 8 },
  surekliBar:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1f0d', paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1e4020' },
  surekliBarAktif: { backgroundColor: '#1a0d0d', borderBottomColor: '#6a1b1b' },
  surekliIcon:  { fontSize: 15 },
  surekliText:  { color: '#81c784', fontSize: 12, flex: 1 },
  surekliKapat: { color: '#546e7a', fontSize: 14, paddingHorizontal: 4 },
  konusuyorBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d2137', paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1c3a52' },
  konusuyorText:{ color: '#4fc3f7', fontSize: 12, flex: 1 },
  liste:        { paddingVertical: 12, paddingBottom: 4 },
  bosluk:       { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  boslukText:   { color: '#eceff1', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  boslukAlt:    { color: '#78909c', fontSize: 14, marginTop: 4, textAlign: 'center' },
  boslukHint:   { color: '#37474f', fontSize: 13, marginTop: 12 },
  typingRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 8 },
  avatar:       { fontSize: 20 },
  hizliContainer:{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  hizliBtn:     { backgroundColor: '#1c2a36', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#263545' },
  hizliText:    { color: '#90caf9', fontSize: 13 },
  inputRow:     { flexDirection: 'row', padding: 10, backgroundColor: '#1c2a36', alignItems: 'flex-end', gap: 8 },
  input:        { flex: 1, backgroundColor: '#263545', color: '#eceff1', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: '#37474f' },
  sendBtn:      { backgroundColor: '#0288d1', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendDisabled: { backgroundColor: '#263545' },
  sendIcon:     { color: '#fff', fontSize: 18 },
  // Drawer
  dimmer:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300 },
  drawer:       { position: 'absolute', top: 0, right: 0, bottom: 0, width: '80%', maxWidth: 320, backgroundColor: '#1c2a36', zIndex: 301, paddingTop: 48, borderLeftWidth: 1, borderLeftColor: '#263545', elevation: 20 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#263545' },
  drawerBaslik: { fontSize: 16, fontWeight: '700', color: '#4fc3f7' },
  drawerKapat:  { fontSize: 18, color: '#78909c', padding: 4 },
  gecmisItem:   { paddingHorizontal: 18, paddingVertical: 14 },
  gecmisOzet:   { fontSize: 14, color: '#eceff1', lineHeight: 20, marginBottom: 4 },
  gecmisTarih:  { fontSize: 11, color: '#546e7a' },
  ayrac:        { height: 1, backgroundColor: '#263545', marginHorizontal: 18 },
  bosText:      { color: '#546e7a', fontSize: 13, textAlign: 'center', padding: 32 },
});

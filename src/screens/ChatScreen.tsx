import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../hooks/useChat';
import { useAudioRecord } from '../hooks/useAudioRecord';
import { useSurekliDinleme } from '../hooks/useSurekliDinleme';
import { MessageBubble } from '../components/MessageBubble';
import { AudioRecordButton } from '../components/AudioRecordButton';
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
    mesajlar, setMesajlar, yukleniyor, sesYukleniyor,
    gecmis, gecmisYukle, yeniSohbet, sor, sesleGonder, tekrarDene,
  } = useChat();

  // AŞAMA 2 (sunucu TTS): PERA-API /api/tts/seslendir üzerinden Microsoft Edge Neural
  // Türkçe ses (tr-TR-EmelNeural/AhmetNeural) — cihaz TTS'sine göre özellikle Android'de
  // çok daha tutarlı/doğal. audioPlayerRef aktifken sesDurdur bunu durdurur; sunucu
  // başarısız olursa (mikroservis henüz ayakta değilse vb.) AŞAMA 1'e (expo-speech,
  // aşağıdaki sesCihazdaOku) otomatik düşülür.
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  // sesDurdur ve sesliOku önce tanımlanıyor (sorVeTTS bağımlı)
  const sesDurdur = useCallback(() => {
    Speech.stop();
    if (audioPlayerRef.current) {
      try { audioPlayerRef.current.pause(); audioPlayerRef.current.remove(); } catch {}
      audioPlayerRef.current = null;
    }
    setKonusuyor(false);
  }, []);

  const konusuyorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // KONUŞMA MODU: useSurekliDinleme'nin konusmaModunuAc'ı henüz tanımlanmadan
  // (aşağıda) sesliOku burada oluşturuluyor — ref ile "ileri referans" çözülüyor.
  const konusmaModunuAcRef = useRef<() => void>(() => {});
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

  const sesliOku = useCallback(async (metin: string) => {
    sesDurdur();
    if (konusuyorTimerRef.current) clearTimeout(konusuyorTimerRef.current);
    setKonusuyor(true);
    const bitti = () => {
      if (konusuyorTimerRef.current) { clearTimeout(konusuyorTimerRef.current); konusuyorTimerRef.current = null; }
      audioPlayerRef.current = null;
      setKonusuyor(false);
      // KONUŞMA MODU: PERA cevabını bitirince, sürekli mod açıksa kullanıcı "pera"
      // demeden 18 saniye içinde devam sorusu sorabilsin.
      if (surekliModRef.current) konusmaModunuAcRef.current();
    };
    // maksimum 30 sn sonra her durumda sıfırla
    konusuyorTimerRef.current = setTimeout(bitti, 30000);

    const metinHazir = ttsMetnHazirla(metin);
    try {
      const token = await SecureStore.getItemAsync(ENV.TOKEN_KEY);
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
        if (status.error) {
          console.log('[PERA-TTS] sunucu TTS hatası, cihaz TTS\'ine düşülüyor:', status.error);
          dinleyici.remove();
          try { player.remove(); } catch {}
          if (audioPlayerRef.current === player) audioPlayerRef.current = null;
          sesCihazdaOku(metinHazir, bitti);
          return;
        }
        if (status.didJustFinish) {
          dinleyici.remove();
          try { player.remove(); } catch {}
          if (audioPlayerRef.current === player) bitti();
        }
      });
      await setAudioModeAsync({ playsInSilentMode: true });
      player.play();
    } catch (e) {
      console.log('[PERA-TTS] sunucu TTS başlatılamadı, cihaz TTS\'ine düşülüyor:', e instanceof Error ? e.message : String(e));
      sesCihazdaOku(metinHazir, bitti);
    }
  }, [sesDurdur, sesCihazdaOku]);

  // TTS wrapper'lar — cevap gelince sesliMod aktifse otomatik okur
  const sesliModRef = useRef(sesliMod);
  sesliModRef.current = sesliMod;

  const sorVeTTS = useCallback(async (metin: string) => {
    sesDurdur();
    const cevap = await sor(metin);
    if (cevap && sesliModRef.current) sesliOku(cevap);
  }, [sor, sesliOku, sesDurdur]);

  const sesleGonderVeTTS = useCallback(async (uri: string) => {
    sesDurdur();
    const cevap = await sesleGonder(uri);
    if (cevap && sesliModRef.current) sesliOku(cevap);
  }, [sesleGonder, sesliOku, sesDurdur]);

  const { kayitYapiliyor, basla, bitir } = useAudioRecord(sesleGonderVeTTS);

  // BARGE-IN: !konusuyor KALDIRILDI — PERA konuşurken de dinleyici çalışmaya devam
  // etmeli ki kullanıcı araya girip konuşabilsin (aşağıdaki peraKonusuyorMu/onKesinti
  // ile useSurekliDinleme bunu "kesinti" olarak işler, wake-word aramaz).
  const { durum: dinlemeDurum, sonTranscript, konusmaModunuAc } = useSurekliDinleme(
    sorVeTTS,
    surekliMod && !kayitYapiliyor && !yukleniyor && !sesYukleniyor,
    konusuyor,
    sesDurdur,
    // "Hey Pera" tek başına söylenince sesli onay — kullanıcı wake-word'ün
    // duyulduğunu (yalnızca ekran metninden değil) sesle de anlasın.
    (ifade) => { sesliOku(ifade); },
  );
  konusmaModunuAcRef.current = konusmaModunuAc;

  useEffect(() => { gecmisYukle(); }, [gecmisYukle]);

  useEffect(() => {
    if (mesajlar.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [mesajlar]);

  const gonder = useCallback(async () => {
    const metin = yazilan.trim();
    if (!metin || yukleniyor) return;
    setYazilan('');
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

  const bos = mesajlar.length === 0 && !yukleniyor && !sesYukleniyor;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: Math.max(insets.top, 12) }]}>
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
              ? 'İşleniyor...'
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
              <Text style={s.boslukHint}>🎤 "pera" de  ·  bas ve konuş  ·  ✍️ yaz</Text>
            </View>
          ) : null
        }
      />

      {/* Typing / STT yükleniyor */}
      {(yukleniyor || sesYukleniyor) && (
        <View style={s.typingRow}>
          <Text style={s.avatar}>🤖</Text>
          {sesYukleniyor
            ? <Text style={s.sesYuklText}>Ses işleniyor...</Text>
            : <TypingIndicator />
          }
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

      {/* Kayıt çubuğu */}
      {kayitYapiliyor && (
        <View style={s.dinleniyorBar}>
          <Text style={s.dinleniyorIcon}>🎙️</Text>
          <Text style={s.dinleniyorText}>Dinleniyor... bırak → gönder</Text>
        </View>
      )}

      {/* Input satırı */}
      <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={s.input}
          placeholder="Soru sorun veya 🎤 basılı tutun..."
          placeholderTextColor="#546e7a"
          value={yazilan}
          onChangeText={setYazilan}
          multiline
          maxLength={500}
          editable={!kayitYapiliyor && !sesYukleniyor}
          returnKeyType="send"
          onSubmitEditing={gonder}
        />
        <AudioRecordButton
          kayitYapiliyor={kayitYapiliyor}
          sesYukleniyor={sesYukleniyor}
          onPressIn={basla}
          onPressOut={bitir}
          disabled={yukleniyor || surekliMod}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!yazilan.trim() || yukleniyor || kayitYapiliyor) && s.sendDisabled]}
          onPress={gonder}
          disabled={!yazilan.trim() || yukleniyor || kayitYapiliyor}
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
  sesYuklText:  { color: '#4fc3f7', fontSize: 13 },
  hizliContainer:{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  hizliBtn:     { backgroundColor: '#1c2a36', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#263545' },
  hizliText:    { color: '#90caf9', fontSize: 13 },
  dinleniyorBar:{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#120820', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderTopWidth: 1, borderTopColor: '#6a1b9a' },
  dinleniyorIcon:{ fontSize: 20 },
  dinleniyorText:{ color: '#ce93d8', fontSize: 13 },
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

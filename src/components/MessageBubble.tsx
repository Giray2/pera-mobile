import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList,
  TextInput, ActivityIndicator, StyleSheet, Share, Alert,
} from 'react-native';
import type { Mesaj } from '../hooks/useChat';
import { mailApi, MailKullanici } from '../services/api';

interface Props {
  mesaj: Mesaj;
  onTekrarDene?: (soru: string) => void;
  onSesliOku?: (metin: string) => void;
}

function MailModal({ metin, onKapat }: { metin: string; onKapat: () => void }) {
  const [kullanicilar, setKullanicilar] = useState<MailKullanici[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [secilen, setSecilen] = useState<MailKullanici | null>(null);
  const [konu, setKonu] = useState('PERA Rapor');

  React.useEffect(() => {
    setYukleniyor(true);
    mailApi.kullanicilar()
      .then((res) => setKullanicilar(res.data))
      .catch(() => setKullanicilar([]))
      .finally(() => setYukleniyor(false));
  }, []);

  const gonder = async () => {
    if (!secilen) return;
    setGonderiliyor(true);
    try {
      await mailApi.gonder(secilen.email, konu, metin);
      Alert.alert('Gönderildi', `${secilen.email} adresine iletildi.`);
      onKapat();
    } catch {
      Alert.alert('Hata', 'Mail gönderilemedi.');
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onKapat}>
      <TouchableOpacity style={s.dimmer} activeOpacity={1} onPress={onKapat} />
      <View style={s.panel}>
        <Text style={s.panelBaslik}>Mail Gönder</Text>
        <TextInput
          style={s.konuInput}
          value={konu}
          onChangeText={setKonu}
          placeholder="Konu"
          placeholderTextColor="#546e7a"
        />
        {yukleniyor ? <ActivityIndicator color="#4fc3f7" /> : (
          <FlatList
            data={kullanicilar}
            keyExtractor={(item) => item.email}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.kullanici, secilen?.email === item.email && s.kullaniciSecili]}
                onPress={() => setSecilen(item)}
              >
                <Text style={s.kullaniciAd}>{item.ad}</Text>
                <Text style={s.kullaniciEmail}>{item.email}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.bosText}>Kullanıcı bulunamadı</Text>}
          />
        )}
        <View style={s.panelAlt}>
          <TouchableOpacity style={s.iptalBtn} onPress={onKapat}>
            <Text style={s.iptalText}>İptal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.gonderBtn, (!secilen || gonderiliyor) && s.gonderBtnDisabled]}
            onPress={gonder}
            disabled={!secilen || gonderiliyor}
          >
            {gonderiliyor ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.gonderText}>Gönder</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function MessageBubble({ mesaj, onTekrarDene, onSesliOku }: Props) {
  const [mailAcik, setMailAcik] = useState(false);
  const isUser = mesaj.tip === 'kullanici';
  const isHata = mesaj.tip === 'hata';
  const isSistem = mesaj.tip === 'sistem';

  const bgStyle = isUser ? s.bubbleUser : isHata ? s.bubbleHata : isSistem ? s.bubbleSistem : s.bubblePera;

  const uzunBaslat = () => {
    if (isUser || isHata || isSistem) return;
    Alert.alert('Mesaj İşlemleri', undefined, [
      { text: '🔈 Sesli Oku', onPress: () => onSesliOku?.(mesaj.metin) },
      { text: '📤 Paylaş', onPress: () => Share.share({ message: mesaj.metin }) },
      { text: '✉️ Mail Gönder', onPress: () => setMailAcik(true) },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  return (
    <View style={[s.row, isUser && s.rowUser]}>
      {!isUser && <Text style={s.avatar}>{isSistem ? 'ℹ️' : isHata ? '⚠️' : '🤖'}</Text>}
      <View style={s.icerik}>
        <TouchableOpacity activeOpacity={0.85} onLongPress={uzunBaslat} delayLongPress={400}>
          <View style={[s.bubble, bgStyle]}>
            <Text style={s.metin}>{mesaj.metin}</Text>
            {!isUser && !isHata && !isSistem && (
              <Text style={s.meta}>
                {mesaj.cachtenGeldi ? '⚡ cache' : mesaj.sureMs ? `⏱ ${(mesaj.sureMs / 1000).toFixed(1)}s` : ''}
                {'  🔈 · ✉️ · ⋯ (basılı tut)'}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {isHata && mesaj.orijinalSoru ? (
          <TouchableOpacity style={s.tekrarBtn} onPress={() => onTekrarDene?.(mesaj.orijinalSoru!)}>
            <Text style={s.tekrarText}>🔄 Tekrar Dene</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {mailAcik && <MailModal metin={mesaj.metin} onKapat={() => setMailAcik(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  row:       { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', paddingHorizontal: 12 },
  rowUser:   { flexDirection: 'row-reverse' },
  avatar:    { fontSize: 20, marginRight: 8 },
  icerik:    { maxWidth: '78%' },
  bubble:    { borderRadius: 14, padding: 12 },
  bubbleUser:{ backgroundColor: '#0288d1', borderBottomRightRadius: 4 },
  bubblePera:{ backgroundColor: '#1c2a36', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#263545' },
  bubbleHata:{ backgroundColor: '#4a1212', borderBottomLeftRadius: 4 },
  bubbleSistem:{ backgroundColor: '#1a1a2e', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a4e' },
  metin:     { color: '#eceff1', fontSize: 14, lineHeight: 20 },
  meta:      { color: '#546e7a', fontSize: 10, marginTop: 4 },
  tekrarBtn: { marginTop: 6, backgroundColor: '#1c2a36', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#ef5350' },
  tekrarText:{ color: '#ef5350', fontSize: 13, fontWeight: '600' },
  // Mail modal
  dimmer:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel:     { backgroundColor: '#1c2a36', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%', position: 'absolute', bottom: 0, left: 0, right: 0 },
  panelBaslik:{ color: '#4fc3f7', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  konuInput: { backgroundColor: '#263545', color: '#eceff1', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#37474f' },
  kullanici: { padding: 12, borderRadius: 10, marginBottom: 6, backgroundColor: '#263545' },
  kullaniciSecili:{ borderWidth: 2, borderColor: '#0288d1' },
  kullaniciAd:{ color: '#eceff1', fontSize: 14, fontWeight: '600' },
  kullaniciEmail:{ color: '#78909c', fontSize: 12 },
  bosText:   { color: '#546e7a', textAlign: 'center', padding: 16 },
  panelAlt:  { flexDirection: 'row', gap: 12, marginTop: 12 },
  iptalBtn:  { flex: 1, backgroundColor: '#263545', borderRadius: 10, padding: 14, alignItems: 'center' },
  iptalText: { color: '#78909c', fontWeight: '600' },
  gonderBtn: { flex: 1, backgroundColor: '#0288d1', borderRadius: 10, padding: 14, alignItems: 'center' },
  gonderBtnDisabled:{ backgroundColor: '#263545' },
  gonderText:{ color: '#fff', fontWeight: '600' },
});

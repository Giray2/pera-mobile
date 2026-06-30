import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { gorevApi, GorevDetay, GorevYorum } from '../services/api';

const DURUM_ADI:  Record<number, string> = { 0: 'Bekliyor', 1: 'Devam Ediyor', 2: 'Tamamlandı', 3: 'İptal' };
const DURUM_RENK: Record<number, string> = { 0: '#78909c', 1: '#0288d1', 2: '#43a047', 3: '#ef5350' };
const ONCELIK_ADI:  Record<number, string> = { 1: 'Düşük', 2: 'Normal', 3: 'Yüksek' };
const ONCELIK_RENK: Record<number, string> = { 1: '#43a047', 2: '#0288d1', 3: '#ef5350' };

export default function GorevDetayScreen({ route, navigation }: any) {
  const { gorevId } = route.params as { gorevId: number };
  const { kullanici } = useAuth();
  const [gorev, setGorev]         = useState<GorevDetay | null>(null);
  const [yorumlar, setYorumlar]   = useState<GorevYorum[]>([]);
  const [yeniYorum, setYeniYorum] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gonderiyor, setGonderiyor] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const yukle = async () => {
    try {
      const [gorevRes, yorumRes] = await Promise.all([
        gorevApi.detay(gorevId),
        gorevApi.yorumlar(gorevId),
      ]);
      setGorev(gorevRes.data);
      setYorumlar(yorumRes.data);
    } catch {
      Alert.alert('Hata', 'Görev yüklenemedi.');
    } finally {
      setYukleniyor(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({ title: 'Görev Detayı' });
    yukle();
  }, [gorevId]);

  const durumGuncelle = async (yeniDurum: number) => {
    try {
      await gorevApi.durumGuncelle(gorevId, yeniDurum);
      setGorev(prev => prev ? { ...prev, durum: yeniDurum as GorevDetay['durum'] } : null);
    } catch {
      Alert.alert('Hata', 'Durum güncellenemedi.');
    }
  };

  const yorumGonder = async () => {
    if (!yeniYorum.trim()) return;
    setGonderiyor(true);
    try {
      await gorevApi.yorumEkle(gorevId, yeniYorum.trim());
      setYeniYorum('');
      const { data } = await gorevApi.yorumlar(gorevId);
      setYorumlar(data);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch {
      Alert.alert('Hata', 'Yorum gönderilemedi.');
    } finally {
      setGonderiyor(false);
    }
  };

  if (yukleniyor) {
    return (
      <View style={styles.yukleniyorContainer}>
        <ActivityIndicator size="large" color="#4fc3f7" />
      </View>
    );
  }

  if (!gorev) return null;

  const benimGorevim = kullanici?.id === gorev.atananId;
  const benimAtadim  = kullanici?.id === gorev.atayanId;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.icerik}>

        <View style={styles.kart}>
          <Text style={styles.gorevBaslik}>{gorev.baslik}</Text>
          {gorev.aciklama ? <Text style={styles.aciklama}>{gorev.aciklama}</Text> : null}
          <View style={styles.satir}>
            <View style={[styles.badge, { backgroundColor: DURUM_RENK[gorev.durum] }]}>
              <Text style={styles.badgeYazi}>{DURUM_ADI[gorev.durum]}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: ONCELIK_RENK[gorev.oncelik] }]}>
              <Text style={styles.badgeYazi}>{ONCELIK_ADI[gorev.oncelik]}</Text>
            </View>
          </View>
        </View>

        <View style={styles.kart}>
          <BilgiSatiri label="Atayan"    value={gorev.atayanAdi} />
          <BilgiSatiri label="Atanan"    value={gorev.atananAdi} />
          {gorev.sonTarih && (
            <BilgiSatiri
              label="Son Tarih"
              value={new Date(gorev.sonTarih).toLocaleDateString('tr-TR')}
              vurgu={gorev.gecikmiMi}
            />
          )}
          <BilgiSatiri
            label="Oluşturulma"
            value={new Date(gorev.olusturmaTarihi).toLocaleDateString('tr-TR')}
          />
        </View>

        {(benimGorevim || benimAtadim) && gorev.durum < 2 && (
          <View style={styles.kart}>
            <Text style={styles.bolumBaslik}>Durum Güncelle</Text>
            <View style={styles.durumButonlar}>
              {gorev.durum === 0 && (
                <DurumButon label="Başladım"   renk="#0288d1" onPress={() => durumGuncelle(1)} />
              )}
              {(gorev.durum === 0 || gorev.durum === 1) && (
                <DurumButon label="Tamamlandı" renk="#43a047" onPress={() => durumGuncelle(2)} />
              )}
              <DurumButon label="İptal" renk="#ef5350" onPress={() => durumGuncelle(3)} />
            </View>
          </View>
        )}

        <View style={styles.kart}>
          <Text style={styles.bolumBaslik}>Yorumlar ({yorumlar.length})</Text>
          {yorumlar.length === 0 && <Text style={styles.bosYorum}>Henüz yorum yok.</Text>}
          {yorumlar.map(y => (
            <View
              key={y.id}
              style={[styles.yorumSatir, y.kullaniciId === kullanici?.id && styles.yorumBenim]}
            >
              <Text style={styles.yorumKisi}>{y.kullaniciAdi}</Text>
              <Text style={styles.yorumMetin}>{y.yorum}</Text>
              <Text style={styles.yorumTarih}>{new Date(y.tarih).toLocaleString('tr-TR')}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={styles.yorumGiris}>
        <TextInput
          style={styles.yorumInput}
          placeholder="Yorum ekle..."
          placeholderTextColor="#546e7a"
          value={yeniYorum}
          onChangeText={setYeniYorum}
          multiline
        />
        <TouchableOpacity
          style={[styles.gonderButon, (!yeniYorum.trim() || gonderiyor) && styles.gonderDevre]}
          onPress={yorumGonder}
          disabled={!yeniYorum.trim() || gonderiyor}
        >
          <Text style={styles.gonderYazi}>{gonderiyor ? '…' : '↑'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function BilgiSatiri({ label, value, vurgu }: { label: string; value: string; vurgu?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: '#78909c', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: vurgu ? '#ef5350' : '#eceff1', fontSize: 13, fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );
}

function DurumButon({ label, renk, onPress }: { label: string; renk: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.durumButon, { backgroundColor: renk }]} onPress={onPress}>
      <Text style={styles.durumButonYazi}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#0f1923' },
  yukleniyorContainer: { flex: 1, backgroundColor: '#0f1923', justifyContent: 'center', alignItems: 'center' },
  icerik:              { padding: 16, gap: 12 },
  kart:                { backgroundColor: '#1c2a36', borderRadius: 12, padding: 14 },
  gorevBaslik:         { fontSize: 17, fontWeight: '700', color: '#eceff1', marginBottom: 6 },
  aciklama:            { fontSize: 14, color: '#90a4ae', marginBottom: 10, lineHeight: 20 },
  satir:               { flexDirection: 'row', gap: 8, marginTop: 6 },
  badge:               { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeYazi:           { fontSize: 12, color: '#fff', fontWeight: '600' },
  bolumBaslik:         { fontSize: 14, fontWeight: '600', color: '#90a4ae', marginBottom: 10 },
  durumButonlar:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  durumButon:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  durumButonYazi:      { color: '#fff', fontWeight: '600', fontSize: 13 },
  bosYorum:            { color: '#546e7a', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  yorumSatir:          { backgroundColor: '#263545', borderRadius: 8, padding: 10, marginBottom: 8 },
  yorumBenim:          { backgroundColor: '#0d3349' },
  yorumKisi:           { fontSize: 12, fontWeight: '600', color: '#4fc3f7', marginBottom: 2 },
  yorumMetin:          { fontSize: 14, color: '#eceff1' },
  yorumTarih:          { fontSize: 10, color: '#546e7a', marginTop: 4 },
  yorumGiris: {
    flexDirection: 'row', padding: 10, backgroundColor: '#1c2a36',
    borderTopWidth: 1, borderTopColor: '#263545',
    alignItems: 'flex-end', gap: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  },
  yorumInput: {
    flex: 1, backgroundColor: '#263545', color: '#eceff1', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    maxHeight: 80, borderWidth: 1, borderColor: '#37474f',
  },
  gonderButon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0288d1', justifyContent: 'center', alignItems: 'center' },
  gonderDevre:  { backgroundColor: '#263545' },
  gonderYazi:   { color: '#fff', fontSize: 18, fontWeight: '700' },
});

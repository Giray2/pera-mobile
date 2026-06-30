import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Modal, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { gorevApi, EkipUye } from '../services/api';

const ONCELIK_ADI:  Record<number, string> = { 1: 'Düşük', 2: 'Normal', 3: 'Yüksek' };
const ONCELIK_RENK: Record<number, string> = { 1: '#43a047', 2: '#0288d1', 3: '#ef5350' };

function tarihFormat(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function tarihISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

export default function GorevOlusturScreen({ navigation }: any) {
  const [ekip, setEkip]           = useState<EkipUye[]>([]);
  const [secili, setSecili]       = useState<number | null>(null);
  const [baslik, setBaslik]       = useState('');
  const [aciklama, setAciklama]   = useState('');
  const [oncelik, setOncelik]     = useState(2);
  const [sonTarih, setSonTarih]   = useState<Date | null>(null);
  const [pickerAcik, setPickerAcik] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gonderiyor, setGonderiyor] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Yeni Görev' });
    gorevApi.ekibim()
      .then(({ data }) => setEkip(data))
      .catch(() => Alert.alert('Hata', 'Ekip listesi yüklenemedi.'))
      .finally(() => setYukleniyor(false));
  }, []);

  const kaydet = async () => {
    if (!secili)        { Alert.alert('Uyarı', 'Atanacak kişiyi seçin.'); return; }
    if (!baslik.trim()) { Alert.alert('Uyarı', 'Başlık zorunludur.'); return; }

    setGonderiyor(true);
    try {
      await gorevApi.olustur({
        atananId: secili,
        baslik:   baslik.trim(),
        aciklama: aciklama.trim() || undefined,
        oncelik,
        sonTarih: sonTarih ? tarihISO(sonTarih) : undefined,
      });
      Alert.alert('Başarılı', 'Görev oluşturuldu.', [
        { text: 'Tamam', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Hata', 'Görev oluşturulamadı.');
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

  const bugun = new Date();
  const maxTarih = new Date(bugun.getFullYear() + 2, 11, 31);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.icerik}>

      <View style={styles.kart}>
        <Text style={styles.etiket}>Atanacak Kişi *</Text>
        {ekip.length === 0 ? (
          <Text style={styles.bosYazi}>Ekibinizde kimse yok.</Text>
        ) : (
          ekip.map(u => (
            <TouchableOpacity
              key={u.kullaniciId}
              style={[styles.kisiSatir, secili === u.kullaniciId && styles.kisiSatirSecili]}
              onPress={() => setSecili(u.kullaniciId)}
            >
              <View>
                <Text style={styles.kisiAd}>{u.adSoyad}</Text>
                <Text style={styles.kisiDept}>{u.departman}</Text>
              </View>
              <Text style={styles.kisiGorev}>{u.aktifGorevSayisi} aktif</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.kart}>
        <Text style={styles.etiket}>Başlık *</Text>
        <TextInput
          style={styles.input}
          placeholder="Görev başlığı"
          placeholderTextColor="#546e7a"
          value={baslik}
          onChangeText={setBaslik}
          maxLength={200}
        />
      </View>

      <View style={styles.kart}>
        <Text style={styles.etiket}>Açıklama</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          placeholder="İsteğe bağlı detay..."
          placeholderTextColor="#546e7a"
          value={aciklama}
          onChangeText={setAciklama}
          multiline
        />
      </View>

      <View style={styles.kart}>
        <Text style={styles.etiket}>Öncelik</Text>
        <View style={styles.oncelikSatir}>
          {[1, 2, 3].map(o => (
            <TouchableOpacity
              key={o}
              style={[styles.oncelikButon, oncelik === o && { backgroundColor: ONCELIK_RENK[o] }]}
              onPress={() => setOncelik(o)}
            >
              <Text style={[styles.oncelikYazi, oncelik === o && { color: '#fff' }]}>
                {ONCELIK_ADI[o]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Son Tarih — tarih seçici */}
      <View style={styles.kart}>
        <Text style={styles.etiket}>Son Tarih</Text>
        <TouchableOpacity style={styles.tarihButon} onPress={() => setPickerAcik(true)}>
          <Text style={sonTarih ? styles.tarihSecili : styles.tarihPlaceholder}>
            {sonTarih ? tarihFormat(sonTarih) : 'Tarih seçin...'}
          </Text>
          <Text style={styles.tarihIkon}>📅</Text>
        </TouchableOpacity>
        {sonTarih && (
          <TouchableOpacity onPress={() => setSonTarih(null)} style={styles.temizleButon}>
            <Text style={styles.temizleYazi}>✕ Tarihi temizle</Text>
          </TouchableOpacity>
        )}
      </View>

      {pickerAcik && (
        Platform.OS === 'android' ? (
          <DateTimePicker
            value={sonTarih ?? bugun}
            mode="date"
            display="default"
            minimumDate={bugun}
            maximumDate={maxTarih}
            onChange={(_, d) => {
              setPickerAcik(false);
              if (d) setSonTarih(d);
            }}
            locale="tr-TR"
          />
        ) : (
          <Modal transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalKutu}>
                <DateTimePicker
                  value={sonTarih ?? bugun}
                  mode="date"
                  display="spinner"
                  minimumDate={bugun}
                  maximumDate={maxTarih}
                  onChange={(_, d) => { if (d) setSonTarih(d); }}
                  locale="tr-TR"
                  style={{ backgroundColor: '#1c2a36' }}
                />
                <TouchableOpacity style={styles.modalTamam} onPress={() => setPickerAcik(false)}>
                  <Text style={styles.modalTamamYazi}>Tamam</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )
      )}

      <TouchableOpacity
        style={[styles.kaydetButon, gonderiyor && { opacity: 0.6 }]}
        onPress={kaydet}
        disabled={gonderiyor}
      >
        {gonderiyor
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.kaydetYazi}>Görevi Oluştur</Text>
        }
      </TouchableOpacity>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#0f1923' },
  yukleniyorContainer: { flex: 1, backgroundColor: '#0f1923', justifyContent: 'center', alignItems: 'center' },
  icerik:              { padding: 16, gap: 12 },
  kart:                { backgroundColor: '#1c2a36', borderRadius: 12, padding: 14 },
  etiket:              { fontSize: 13, fontWeight: '600', color: '#90a4ae', marginBottom: 8 },
  input: {
    backgroundColor: '#263545', color: '#eceff1', borderRadius: 8,
    padding: 12, fontSize: 14, borderWidth: 1, borderColor: '#37474f',
  },
  kisiSatir: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#37474f', marginBottom: 6,
  },
  kisiSatirSecili: { borderColor: '#0288d1', backgroundColor: '#0d3349' },
  kisiAd:          { fontSize: 14, fontWeight: '600', color: '#eceff1' },
  kisiDept:        { fontSize: 12, color: '#90a4ae' },
  kisiGorev:       { fontSize: 12, color: '#78909c' },
  bosYazi:         { color: '#546e7a', textAlign: 'center', padding: 8 },
  oncelikSatir:    { flexDirection: 'row', gap: 8 },
  oncelikButon: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#37474f',
  },
  oncelikYazi:     { fontSize: 13, fontWeight: '500', color: '#90a4ae' },
  tarihButon: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#263545', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#37474f',
  },
  tarihSecili:      { fontSize: 15, color: '#eceff1', fontWeight: '500' },
  tarihPlaceholder: { fontSize: 14, color: '#546e7a' },
  tarihIkon:        { fontSize: 20 },
  temizleButon:     { marginTop: 8, alignSelf: 'flex-end' },
  temizleYazi:      { fontSize: 12, color: '#ef5350' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalKutu: {
    backgroundColor: '#1c2a36', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  modalTamam: {
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: '#0288d1', borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  modalTamamYazi: { color: '#fff', fontSize: 16, fontWeight: '600' },
  kaydetButon: {
    backgroundColor: '#0288d1', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  kaydetYazi: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

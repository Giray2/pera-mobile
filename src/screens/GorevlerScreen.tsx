import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { gorevApi, GorevOzet } from '../services/api';

type Tip = 'bana' | 'atadim';
type DurumFiltre = null | 0 | 1 | 2;

const DURUM_ADI:  Record<number, string> = { 0: 'Bekliyor', 1: 'Devam Ediyor', 2: 'Tamamlandı', 3: 'İptal' };
const DURUM_RENK: Record<number, string> = { 0: '#78909c', 1: '#0288d1', 2: '#43a047', 3: '#ef5350' };

const DURUM_FILTRELER: { etiket: string; deger: DurumFiltre }[] = [
  { etiket: 'Tümü',      deger: null },
  { etiket: 'Bekliyor',  deger: 0    },
  { etiket: 'Devam',     deger: 1    },
  { etiket: 'Tamamlandı', deger: 2   },
];
const ONCELIK_ADI:  Record<number, string> = { 1: 'Düşük', 2: 'Normal', 3: 'Yüksek' };
const ONCELIK_RENK: Record<number, string> = { 1: '#43a047', 2: '#0288d1', 3: '#ef5350' };

export default function GorevlerScreen({ navigation }: any) {
  const { kullanici } = useAuth();
  const [tip, setTip]                 = useState<Tip>('bana');
  const [durumFiltre, setDurumFiltre] = useState<DurumFiltre>(null);
  const [gorevler, setGorevler]       = useState<GorevOzet[]>([]);
  const [yukleniyor, setYukleniyor]   = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);

  const yukle = useCallback(async (yenile = false) => {
    yenile ? setYenileniyor(true) : setYukleniyor(true);
    try {
      const { data } = await gorevApi.liste(tip);
      setGorevler(data);
    } catch {
      setGorevler([]);
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [tip]);

  useEffect(() => { yukle(); }, [yukle]);

  const filtreliGorevler = durumFiltre === null
    ? gorevler
    : gorevler.filter(g => g.durum === durumFiltre);

  const renderGorev = ({ item }: { item: GorevOzet }) => (
    <TouchableOpacity
      style={[styles.kart, item.gecikmiMi && styles.kartGecikmis]}
      onPress={() => navigation.navigate('GorevDetay', { gorevId: item.id })}
    >
      <View style={styles.kartUst}>
        <Text style={styles.baslik} numberOfLines={2}>{item.baslik}</Text>
        <View style={[styles.badge, { backgroundColor: DURUM_RENK[item.durum] }]}>
          <Text style={styles.badgeYazi}>{DURUM_ADI[item.durum]}</Text>
        </View>
      </View>
      <View style={styles.kartAlt}>
        <Text style={styles.kisiYazi}>
          {tip === 'bana' ? `📌 ${item.atayanAdi}` : `👤 ${item.atananAdi}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {item.gecikmiMi && <Text style={styles.gecikmisYazi}>GECİKMİŞ</Text>}
          <View style={[styles.badge, { backgroundColor: ONCELIK_RENK[item.oncelik] }]}>
            <Text style={styles.badgeYazi}>{ONCELIK_ADI[item.oncelik]}</Text>
          </View>
        </View>
      </View>
      {item.sonTarih && (
        <Text style={styles.tarihYazi}>
          ⏰ {new Date(item.sonTarih).toLocaleDateString('tr-TR')}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerBaslik}>Görevler</Text>
        <Text style={styles.headerKullanici}>{kullanici?.adi}</Text>
      </View>

      <View style={styles.tabBar}>
        {([['bana', 'Bana Atananlar'], ['atadim', 'Atadıklarım']] as [Tip, string][]).map(([k, label]) => (
          <TouchableOpacity
            key={k}
            style={[styles.tab, tip === k && styles.tabAktif]}
            onPress={() => setTip(k)}
          >
            <Text style={[styles.tabYazi, tip === k && styles.tabYaziAktif]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filtreSeridi}>
        {DURUM_FILTRELER.map(({ etiket, deger }) => {
          const aktif = durumFiltre === deger;
          const renk  = deger !== null ? DURUM_RENK[deger] : '#4fc3f7';
          return (
            <TouchableOpacity
              key={String(deger)}
              style={[styles.filtreBtn, aktif && { backgroundColor: renk, borderColor: renk }]}
              onPress={() => setDurumFiltre(deger)}
            >
              <Text style={[styles.filtreBtnYazi, aktif && styles.filtreBtnYaziAktif]}>{etiket}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {yukleniyor ? (
        <ActivityIndicator size="large" color="#4fc3f7" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtreliGorevler}
          keyExtractor={item => item.id.toString()}
          renderItem={renderGorev}
          contentContainerStyle={styles.liste}
          refreshControl={
            <RefreshControl refreshing={yenileniyor} onRefresh={() => yukle(true)} tintColor="#4fc3f7" />
          }
          ListEmptyComponent={<Text style={styles.bosYazi}>Görev bulunamadı.</Text>}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('GorevOlustur')}>
        <Text style={styles.fabYazi}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0f1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1c2a36', paddingHorizontal: 16, paddingVertical: 12,
  },
  headerBaslik:    { fontSize: 20, fontWeight: 'bold', color: '#4fc3f7' },
  headerKullanici: { fontSize: 13, color: '#90a4ae' },
  tabBar:          { flexDirection: 'row', backgroundColor: '#1c2a36', borderBottomWidth: 1, borderBottomColor: '#263545' },
  tab:             { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabAktif:        { borderBottomWidth: 2, borderBottomColor: '#0288d1' },
  tabYazi:         { color: '#78909c', fontSize: 13 },
  tabYaziAktif:    { color: '#4fc3f7', fontWeight: '600' },
  liste:           { padding: 12, gap: 10 },
  kart:            { backgroundColor: '#1c2a36', borderRadius: 12, padding: 14 },
  kartGecikmis:    { borderLeftWidth: 3, borderLeftColor: '#ef5350' },
  kartUst:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  baslik:          { flex: 1, fontSize: 15, fontWeight: '600', color: '#eceff1', marginRight: 8 },
  kartAlt:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeYazi:       { fontSize: 11, color: '#fff', fontWeight: '600' },
  kisiYazi:        { fontSize: 12, color: '#90a4ae' },
  tarihYazi:       { fontSize: 11, color: '#78909c', marginTop: 6 },
  gecikmisYazi:    { fontSize: 10, color: '#ef5350', fontWeight: '700' },
  filtreSeridi: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#0f1923', borderBottomWidth: 1, borderBottomColor: '#1c2a36',
  },
  filtreBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: '#2e3f4f',
  },
  filtreBtnYazi:      { fontSize: 12, color: '#78909c' },
  filtreBtnYaziAktif: { color: '#fff', fontWeight: '600' },
  bosYazi:         { textAlign: 'center', color: '#546e7a', marginTop: 60, fontSize: 15 },
  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#0288d1', justifyContent: 'center', alignItems: 'center',
    elevation: 6,
  },
  fabYazi: { color: '#fff', fontSize: 26, lineHeight: 30 },
});

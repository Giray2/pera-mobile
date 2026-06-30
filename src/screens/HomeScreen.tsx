import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import VersionEtiketi from '../components/VersionEtiketi';
import { gorevApi, GorevOzet } from '../services/api';

const DURUM_ADI:  Record<number, string> = { 0: 'Bekliyor', 1: 'Devam Ediyor', 2: 'Tamamlandı', 3: 'İptal' };
const DURUM_RENK: Record<number, string> = { 0: '#78909c', 1: '#0288d1', 2: '#43a047', 3: '#ef5350' };

interface Ozet {
  bekliyor: number;
  devamEdiyor: number;
  tamamlandi: number;
  gecikmis: number;
}

function hesaplaOzet(gorevler: GorevOzet[]): Ozet {
  return {
    bekliyor:    gorevler.filter(g => g.durum === 0).length,
    devamEdiyor: gorevler.filter(g => g.durum === 1).length,
    tamamlandi:  gorevler.filter(g => g.durum === 2).length,
    gecikmis:    gorevler.filter(g => g.gecikmiMi).length,
  };
}

function selamlama(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

// ── Alt bileşenler ──────────────────────────────────────────────────────────

function StatKart({
  baslik, deger, renk, emoji,
}: { baslik: string; deger: number; renk: string; emoji: string }) {
  return (
    <View style={[s.statKart, { borderTopColor: renk }]}>
      <Text style={s.statEmoji}>{emoji}</Text>
      <Text style={[s.statDeger, { color: renk }]}>{deger}</Text>
      <Text style={s.statBaslik}>{baslik}</Text>
    </View>
  );
}

function AksiyonBtn({
  emoji, baslik, renk, onPress,
}: { emoji: string; baslik: string; renk: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.aksiyonBtn, { borderColor: renk + '66' }]} onPress={onPress}>
      <View style={[s.aksiyonIcon, { backgroundColor: renk + '22' }]}>
        <Text style={s.aksiyonEmoji}>{emoji}</Text>
      </View>
      <Text style={s.aksiyonBaslik}>{baslik}</Text>
    </TouchableOpacity>
  );
}

function GorevKarti({
  item, onPress,
}: { item: GorevOzet; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.gorevKart, item.gecikmiMi && s.gorevKartGecikmis]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={s.gorevKartUst}>
        <Text style={s.gorevBaslik} numberOfLines={2}>{item.baslik}</Text>
        <View style={[s.badge, { backgroundColor: DURUM_RENK[item.durum] }]}>
          <Text style={s.badgeYazi}>{DURUM_ADI[item.durum]}</Text>
        </View>
      </View>
      <View style={s.gorevKartAlt}>
        <Text style={s.gorevAtayan} numberOfLines={1}>📌 {item.atayanAdi}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.gecikmiMi && <Text style={s.gecikmisYazi}>GECİKMİŞ</Text>}
          {item.sonTarih && (
            <Text style={s.gorevTarih}>
              ⏰ {new Date(item.sonTarih).toLocaleDateString('tr-TR')}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Ana Ekran ───────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }: any) {
  const { kullanici, cikisYap } = useAuth();
  const insets = useSafeAreaInsets();
  const [gorevler, setGorevler]       = useState<GorevOzet[]>([]);
  const [yukleniyor, setYukleniyor]   = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);

  const yukle = useCallback(async (yenile = false) => {
    yenile ? setYenileniyor(true) : setYukleniyor(true);
    try {
      const { data } = await gorevApi.liste('bana');
      setGorevler(data);
    } catch {
      setGorevler([]);
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  const ozet       = hesaplaOzet(gorevler);
  const aktifler   = gorevler.filter(g => g.durum !== 2 && g.durum !== 3).slice(0, 4);
  const bugun      = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={[s.icerik, { paddingTop: Math.max(insets.top, 20) }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={yenileniyor} onRefresh={() => yukle(true)} tintColor="#4fc3f7" />
      }
    >
      {/* ── Başlık ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <View style={s.peraRow}>
            <Text style={s.peraLogo}>PERA</Text>
            <View style={s.peraKonusuyor} />
          </View>
          <Text style={s.selamlama}>{selamlama()},</Text>
          <Text style={s.adSoyad} numberOfLines={1}>
            {kullanici?.adi || 'Kullanıcı'}
          </Text>
          <Text style={s.tarih}>{bugun}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <VersionEtiketi />
          <TouchableOpacity
            onPress={cikisYap}
            style={s.cikisBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={s.cikisBtnText}>🚪</Text>
            <Text style={s.cikisLabel}>Çıkış</Text>
          </TouchableOpacity>
        </View>
      </View>

      {yukleniyor ? (
        <ActivityIndicator size="large" color="#4fc3f7" style={{ marginVertical: 48 }} />
      ) : (
        <>
          {/* ── İstatistik Kartları ── */}
          <View style={s.statsRow}>
            <StatKart baslik="Bekliyor"    deger={ozet.bekliyor}    renk="#78909c" emoji="📋" />
            <StatKart baslik="Devam Eden"  deger={ozet.devamEdiyor} renk="#0288d1" emoji="⚙️" />
            <StatKart baslik="Tamamlandı"  deger={ozet.tamamlandi}  renk="#43a047" emoji="✅" />
            <StatKart baslik="Gecikmiş"    deger={ozet.gecikmis}    renk="#ef5350" emoji="⚠️" />
          </View>

          {/* ── Hızlı Erişim ── */}
          <Text style={s.bolumBaslik}>Hızlı Erişim</Text>
          <View style={s.aksiyonRow}>
            <AksiyonBtn
              emoji="🤖"
              baslik="AI Asistan"
              renk="#4fc3f7"
              onPress={() => navigation.navigate('Chat')}
            />
            <AksiyonBtn
              emoji="➕"
              baslik="Görev Oluştur"
              renk="#66bb6a"
              onPress={() => navigation.navigate('GorevOlustur')}
            />
            <AksiyonBtn
              emoji="📋"
              baslik="Tüm Görevler"
              renk="#ab47bc"
              onPress={() => navigation.navigate('Gorevler')}
            />
          </View>

          {/* ── Aktif Görevler ── */}
          {aktifler.length > 0 ? (
            <>
              <View style={s.bolumRow}>
                <Text style={s.bolumBaslik}>Aktif Görevlerim</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Gorevler')}>
                  <Text style={s.tumunu}>Tümünü gör →</Text>
                </TouchableOpacity>
              </View>
              {aktifler.map(item => (
                <GorevKarti
                  key={item.id}
                  item={item}
                  onPress={() => navigation.navigate('GorevDetay', { gorevId: item.id })}
                />
              ))}
            </>
          ) : (
            <View style={s.bosluKart}>
              <Text style={s.bosluEmoji}>🎉</Text>
              <Text style={s.bosluBaslik}>Harika!</Text>
              <Text style={s.bosluYazi}>Bekleyen aktif göreviniz yok.</Text>
            </View>
          )}

          {/* ── PERA Yardım Kutusu ── */}
          <TouchableOpacity
            style={s.peraYardim}
            onPress={() => navigation.navigate('Chat')}
            activeOpacity={0.8}
          >
            <Text style={s.peraYardimEmoji}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.peraYardimBaslik}>PERA'ya Sor</Text>
              <Text style={s.peraYardimAlt}>
                ERP verileriniz, raporlar veya herhangi bir soru için…
              </Text>
            </View>
            <Text style={s.peraYardimOk}>›</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ── Stiller ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  icerik:    { paddingHorizontal: 16, paddingBottom: 40, gap: 0 },

  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  peraRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  peraLogo:     { fontSize: 13, fontWeight: '800', color: '#4fc3f7', letterSpacing: 3 },
  peraKonusuyor:{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#43a047' },
  selamlama:    { fontSize: 13, color: '#78909c' },
  adSoyad:      { fontSize: 26, fontWeight: 'bold', color: '#eceff1', marginTop: 2 },
  tarih:        { fontSize: 12, color: '#546e7a', marginTop: 4 },
  cikisBtn:     { alignItems: 'center', padding: 6 },
  cikisBtnText: { fontSize: 22 },
  cikisLabel:   { fontSize: 9, color: '#546e7a', marginTop: 2 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statKart: {
    flex: 1, backgroundColor: '#1c2a36', borderRadius: 10,
    padding: 10, alignItems: 'center', borderTopWidth: 3,
  },
  statEmoji:  { fontSize: 17, marginBottom: 4 },
  statDeger:  { fontSize: 21, fontWeight: 'bold' },
  statBaslik: { fontSize: 9, color: '#78909c', textAlign: 'center', marginTop: 3, lineHeight: 13 },

  // Bölüm
  bolumBaslik: { fontSize: 13, fontWeight: '700', color: '#90caf9', marginBottom: 10 },
  bolumRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  tumunu: { fontSize: 12, color: '#4fc3f7' },

  // Aksiyon butonları
  aksiyonRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  aksiyonBtn: {
    flex: 1, backgroundColor: '#1c2a36', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1,
  },
  aksiyonIcon:  { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  aksiyonEmoji: { fontSize: 22 },
  aksiyonBaslik:{ fontSize: 11, color: '#b0bec5', textAlign: 'center' },

  // Görev kartı
  gorevKart: {
    backgroundColor: '#1c2a36', borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  gorevKartGecikmis: { borderLeftWidth: 3, borderLeftColor: '#ef5350' },
  gorevKartUst: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 6,
  },
  gorevBaslik:  { flex: 1, fontSize: 14, fontWeight: '600', color: '#eceff1', marginRight: 8 },
  gorevKartAlt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gorevAtayan:  { flex: 1, fontSize: 11, color: '#90a4ae' },
  gorevTarih:   { fontSize: 11, color: '#78909c' },
  gecikmisYazi: { fontSize: 10, color: '#ef5350', fontWeight: '700' },
  badge:        { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  badgeYazi:    { fontSize: 10, color: '#fff', fontWeight: '600' },

  // Boş durum
  bosluKart: {
    alignItems: 'center', paddingVertical: 36,
    backgroundColor: '#1c2a36', borderRadius: 12, marginBottom: 20,
  },
  bosluEmoji:  { fontSize: 44, marginBottom: 10 },
  bosluBaslik: { fontSize: 16, fontWeight: '700', color: '#eceff1', marginBottom: 4 },
  bosluYazi:   { color: '#78909c', fontSize: 13 },

  // PERA yardım kutusu
  peraYardim: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0d2137', borderRadius: 12,
    padding: 16, gap: 12, marginTop: 8,
    borderWidth: 1, borderColor: '#1c3a52',
  },
  peraYardimEmoji:  { fontSize: 28 },
  peraYardimBaslik: { fontSize: 14, fontWeight: '700', color: '#4fc3f7', marginBottom: 3 },
  peraYardimAlt:    { fontSize: 12, color: '#546e7a', lineHeight: 17 },
  peraYardimOk:     { fontSize: 24, color: '#263545' },
});

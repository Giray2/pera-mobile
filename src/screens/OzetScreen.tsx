import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gorevApi, GorevOzet } from '../services/api';
import IlerlemeHalkasi from '../components/IlerlemeHalkasi';

type Tip = 'bana' | 'atadim';

interface OzetVeri {
  toplam: number;
  bekliyor: number;
  devamEdiyor: number;
  tamamlandi: number;
  iptal: number;
  gecikmis: number;
  dusuk: number;
  normal: number;
  yuksek: number;
  tamamlanmaOrani: number;
  gecikmeOrani: number;
}

const BOŞ_VERİ: OzetVeri = {
  toplam: 0, bekliyor: 0, devamEdiyor: 0, tamamlandi: 0, iptal: 0,
  gecikmis: 0, dusuk: 0, normal: 0, yuksek: 0,
  tamamlanmaOrani: 0, gecikmeOrani: 0,
};

function hesapla(gorevler: GorevOzet[]): OzetVeri {
  const toplam = gorevler.length;
  if (toplam === 0) return BOŞ_VERİ;

  const bekliyor    = gorevler.filter(g => g.durum === 0).length;
  const devamEdiyor = gorevler.filter(g => g.durum === 1).length;
  const tamamlandi  = gorevler.filter(g => g.durum === 2).length;
  const iptal       = gorevler.filter(g => g.durum === 3).length;
  const gecikmis    = gorevler.filter(g => g.gecikmiMi).length;
  const dusuk       = gorevler.filter(g => g.oncelik === 1).length;
  const normal      = gorevler.filter(g => g.oncelik === 2).length;
  const yuksek      = gorevler.filter(g => g.oncelik === 3).length;

  const aktif = toplam - iptal;
  const tamamlanmaOrani = aktif > 0 ? Math.round((tamamlandi / aktif) * 100) : 0;
  const gecikmeOrani    = toplam > 0 ? Math.round((gecikmis / toplam) * 100) : 0;

  return {
    toplam, bekliyor, devamEdiyor, tamamlandi, iptal,
    gecikmis, dusuk, normal, yuksek, tamamlanmaOrani, gecikmeOrani,
  };
}

// ── Alt Bileşenler ───────────────────────────────────────────────────────────

function Cubuk({
  baslik, adet, toplam, renk, emoji,
}: { baslik: string; adet: number; toplam: number; renk: string; emoji: string }) {
  const yuzde = toplam > 0 ? Math.round((adet / toplam) * 100) : 0;
  return (
    <View style={s.cubukSatir}>
      <View style={s.cubukLabel}>
        <Text style={s.cubukEmoji}>{emoji}</Text>
        <Text style={s.cubukBaslik}>{baslik}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[s.cubukAdet, { color: renk }]}>{adet}</Text>
        <Text style={s.cubukYuzde}>  %{yuzde}</Text>
      </View>
      <View style={s.cubukPist}>
        <View style={[s.cubukDolu, { width: `${yuzde}%` as any, backgroundColor: renk }]} />
      </View>
    </View>
  );
}

function MetrikKart({
  emoji, baslik, deger, renk,
}: { emoji: string; baslik: string; deger: string | number; renk: string }) {
  return (
    <View style={[s.metrikKart, { borderTopColor: renk }]}>
      <Text style={s.metrikEmoji}>{emoji}</Text>
      <Text style={[s.metrikDeger, { color: renk }]}>{deger}</Text>
      <Text style={s.metrikBaslik}>{baslik}</Text>
    </View>
  );
}

// ── Ana Ekran ────────────────────────────────────────────────────────────────

export default function OzetScreen() {
  const insets = useSafeAreaInsets();
  const [tip, setTip]                 = useState<Tip>('bana');
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

  const veri = hesapla(gorevler);

  const tamamlanmaRenk =
    veri.tamamlanmaOrani >= 75 ? '#43a047' :
    veri.tamamlanmaOrani >= 40 ? '#0288d1' :
    '#ef5350';

  return (
    <View style={s.kap}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={s.headerBaslik}>📊  Özet</Text>
        <View style={s.tabBar}>
          {([['bana', 'Bana Atananlar'], ['atadim', 'Atadıklarım']] as [Tip, string][]).map(
            ([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[s.tab, tip === k && s.tabAktif]}
                onPress={() => setTip(k)}
              >
                <Text style={[s.tabYazi, tip === k && s.tabYaziAktif]}>{label}</Text>
              </TouchableOpacity>
            ),
          )}
        </View>
      </View>

      {yukleniyor ? (
        <ActivityIndicator size="large" color="#4fc3f7" style={{ marginTop: 80 }} />
      ) : (
        <ScrollView
          contentContainerStyle={s.icerik}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={yenileniyor}
              onRefresh={() => yukle(true)}
              tintColor="#4fc3f7"
            />
          }
        >
          {/* ── Genel Bakış Kartı ── */}
          <View style={s.kart}>
            <Text style={s.kartBaslik}>Genel Bakış</Text>
            <View style={s.genelRow}>
              <IlerlemeHalkasi
                yuzde={veri.tamamlanmaOrani}
                boyut={130}
                kalinlik={12}
                renk={tamamlanmaRenk}
                arkaPlan="#263545"
              >
                <Text style={[s.ringYuzde, { color: tamamlanmaRenk }]}>
                  %{veri.tamamlanmaOrani}
                </Text>
                <Text style={s.ringAlt}>Tamamlandı</Text>
              </IlerlemeHalkasi>

              <View style={s.genelSag}>
                <View style={s.genelSatir}>
                  <Text style={s.genelEmoji}>📋</Text>
                  <Text style={s.genelLabel}>Toplam Görev</Text>
                  <Text style={s.genelDeger}>{veri.toplam}</Text>
                </View>
                <View style={s.genelSatir}>
                  <Text style={s.genelEmoji}>✅</Text>
                  <Text style={s.genelLabel}>Tamamlandı</Text>
                  <Text style={[s.genelDeger, { color: '#43a047' }]}>{veri.tamamlandi}</Text>
                </View>
                <View style={s.genelSatir}>
                  <Text style={s.genelEmoji}>⚙️</Text>
                  <Text style={s.genelLabel}>Devam Eden</Text>
                  <Text style={[s.genelDeger, { color: '#0288d1' }]}>{veri.devamEdiyor}</Text>
                </View>
                <View style={s.genelSatir}>
                  <Text style={s.genelEmoji}>⚠️</Text>
                  <Text style={s.genelLabel}>Gecikmiş</Text>
                  <Text style={[s.genelDeger, { color: '#ef5350' }]}>{veri.gecikmis}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── Gecikme Uyarısı ── */}
          {veri.gecikmis > 0 && (
            <View style={s.uyariKart}>
              <Text style={s.uyariEmoji}>🚨</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.uyariBaslik}>{veri.gecikmis} gecikmiş görev!</Text>
                <Text style={s.uyariAlt}>
                  Toplam görevlerin %{veri.gecikmeOrani}'si gecikti.
                </Text>
              </View>
            </View>
          )}

          {/* ── Metrik Kartları ── */}
          <View style={s.metrikRow}>
            <MetrikKart
              emoji="🎯"
              baslik="Tamamlanma"
              deger={`%${veri.tamamlanmaOrani}`}
              renk={tamamlanmaRenk}
            />
            <MetrikKart
              emoji="⏳"
              baslik="Bekliyor"
              deger={veri.bekliyor}
              renk="#78909c"
            />
            <MetrikKart
              emoji="🚫"
              baslik="İptal"
              deger={veri.iptal}
              renk="#546e7a"
            />
          </View>

          {veri.toplam > 0 ? (
            <>
              {/* ── Durum Dağılımı ── */}
              <View style={s.kart}>
                <Text style={s.kartBaslik}>Durum Dağılımı</Text>
                <Cubuk baslik="Bekliyor"     adet={veri.bekliyor}    toplam={veri.toplam} renk="#78909c" emoji="📋" />
                <Cubuk baslik="Devam Ediyor" adet={veri.devamEdiyor} toplam={veri.toplam} renk="#0288d1" emoji="⚙️" />
                <Cubuk baslik="Tamamlandı"  adet={veri.tamamlandi}  toplam={veri.toplam} renk="#43a047" emoji="✅" />
                <Cubuk baslik="İptal"        adet={veri.iptal}       toplam={veri.toplam} renk="#546e7a" emoji="🚫" />
              </View>

              {/* ── Öncelik Dağılımı ── */}
              <View style={s.kart}>
                <Text style={s.kartBaslik}>Öncelik Dağılımı</Text>
                <Cubuk baslik="Yüksek" adet={veri.yuksek} toplam={veri.toplam} renk="#ef5350" emoji="🔴" />
                <Cubuk baslik="Normal" adet={veri.normal} toplam={veri.toplam} renk="#0288d1" emoji="🟡" />
                <Cubuk baslik="Düşük"  adet={veri.dusuk}  toplam={veri.toplam} renk="#43a047" emoji="🟢" />
              </View>
            </>
          ) : (
            <View style={s.bosKart}>
              <Text style={s.bosEmoji}>📭</Text>
              <Text style={s.bosBaslik}>Görev Bulunamadı</Text>
              <Text style={s.bosAlt}>
                {tip === 'bana' ? 'Size atanmış görev yok.' : 'Atadığınız görev yok.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Stiller ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  kap: { flex: 1, backgroundColor: '#0f1923' },

  header: {
    backgroundColor: '#1c2a36',
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#263545',
  },
  headerBaslik: { fontSize: 20, fontWeight: 'bold', color: '#4fc3f7', marginBottom: 12 },

  tabBar:       { flexDirection: 'row' },
  tab:          { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabAktif:     { borderBottomWidth: 2, borderBottomColor: '#0288d1' },
  tabYazi:      { color: '#78909c', fontSize: 13 },
  tabYaziAktif: { color: '#4fc3f7', fontWeight: '600' },

  icerik: { padding: 16, gap: 12, paddingBottom: 40 },

  kart: {
    backgroundColor: '#1c2a36', borderRadius: 12,
    padding: 16, gap: 10,
  },
  kartBaslik: { fontSize: 13, fontWeight: '700', color: '#90caf9', marginBottom: 2 },

  // Genel bakış
  genelRow:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
  genelSag:   { flex: 1, gap: 10 },
  genelSatir: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  genelEmoji: { fontSize: 14, width: 20 },
  genelLabel: { flex: 1, fontSize: 12, color: '#90a4ae' },
  genelDeger: { fontSize: 15, fontWeight: '700', color: '#eceff1' },

  ringYuzde: { fontSize: 22, fontWeight: 'bold' },
  ringAlt:   { fontSize: 10, color: '#78909c', marginTop: 1 },

  // Gecikme uyarısı
  uyariKart: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#2d1515', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#ef535055',
  },
  uyariEmoji:  { fontSize: 26 },
  uyariBaslik: { fontSize: 14, fontWeight: '700', color: '#ef5350' },
  uyariAlt:    { fontSize: 12, color: '#b71c1c', marginTop: 2 },

  // Metrik kartları
  metrikRow: { flexDirection: 'row', gap: 8 },
  metrikKart: {
    flex: 1, backgroundColor: '#1c2a36', borderRadius: 10,
    padding: 12, alignItems: 'center', borderTopWidth: 3,
  },
  metrikEmoji:  { fontSize: 18, marginBottom: 4 },
  metrikDeger:  { fontSize: 18, fontWeight: 'bold' },
  metrikBaslik: { fontSize: 10, color: '#78909c', textAlign: 'center', marginTop: 3 },

  // Çubuk
  cubukSatir:  { gap: 5 },
  cubukLabel:  { flexDirection: 'row', alignItems: 'center' },
  cubukEmoji:  { fontSize: 13, width: 22 },
  cubukBaslik: { fontSize: 12, color: '#b0bec5' },
  cubukAdet:   { fontSize: 13, fontWeight: '700' },
  cubukYuzde:  { fontSize: 11, color: '#546e7a' },
  cubukPist:   { height: 6, backgroundColor: '#263545', borderRadius: 3, overflow: 'hidden' },
  cubukDolu:   { height: 6, borderRadius: 3 },

  // Boş durum
  bosKart: {
    alignItems: 'center', paddingVertical: 52,
    backgroundColor: '#1c2a36', borderRadius: 12,
  },
  bosEmoji:  { fontSize: 48, marginBottom: 12 },
  bosBaslik: { fontSize: 16, fontWeight: '700', color: '#eceff1', marginBottom: 6 },
  bosAlt:    { fontSize: 13, color: '#78909c' },
});

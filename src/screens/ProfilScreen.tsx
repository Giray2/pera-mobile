import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { kullaniciApi } from '../services/api';

export default function ProfilScreen() {
  const insets = useSafeAreaInsets();
  const { kullanici, cikisYap } = useAuth();

  const [eskiSifre, setEskiSifre]     = useState('');
  const [yeniSifre, setYeniSifre]     = useState('');
  const [tekrarSifre, setTekrarSifre] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const [eskiGorunur, setEskiGorunur]     = useState(false);
  const [yeniGorunur, setYeniGorunur]     = useState(false);
  const [tekrarGorunur, setTekrarGorunur] = useState(false);

  const sifreDegistir = async () => {
    if (!eskiSifre || !yeniSifre || !tekrarSifre) {
      Alert.alert('Hata', 'Tüm alanları doldurun.');
      return;
    }
    if (yeniSifre !== tekrarSifre) {
      Alert.alert('Hata', 'Yeni şifreler eşleşmiyor.');
      return;
    }
    if (yeniSifre.length < 6) {
      Alert.alert('Hata', 'Yeni şifre en az 6 karakter olmalıdır.');
      return;
    }
    setGonderiliyor(true);
    try {
      await kullaniciApi.sifreDegistir(eskiSifre, yeniSifre);
      Alert.alert('Başarılı', 'Şifreniz güncellendi.');
      setEskiSifre('');
      setYeniSifre('');
      setTekrarSifre('');
    } catch (err: any) {
      const mesaj = err?.response?.data?.mesaj ?? 'Şifre değiştirilemedi.';
      Alert.alert('Hata', mesaj);
    } finally {
      setGonderiliyor(false);
    }
  };

  const cikisOnay = () => {
    Alert.alert(
      'Çıkış Yap',
      'Oturumu kapatmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Çıkış Yap', style: 'destructive', onPress: cikisYap },
      ],
    );
  };

  const yeniSifreUyusuyor = yeniSifre.length > 0 && tekrarSifre.length > 0
    ? yeniSifre === tekrarSifre
    : null;

  return (
    <ScrollView
      style={s.kap}
      contentContainerStyle={[s.icerik, { paddingTop: Math.max(insets.top, 16) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Avatar & İsim ── */}
      <View style={s.avatarKap}>
        <View style={s.avatar}>
          <Text style={s.avatarHarf}>
            {kullanici?.adi?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={s.kullaniciAdi}>{kullanici?.adi ?? '—'}</Text>
        {kullanici?.rol ? (
          <View style={s.rolBadge}>
            <Text style={s.rolYazi}>{kullanici.rol}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Hesap Bilgileri ── */}
      <View style={s.kart}>
        <Text style={s.kartBaslik}>Hesap Bilgileri</Text>
        <BilgiSatiri emoji="👤" label="Ad Soyad" deger={kullanici?.adi ?? '—'} />
        <BilgiSatiri emoji="📧" label="E-posta"  deger={kullanici?.email ?? '—'} />
        <BilgiSatiri emoji="🏷️" label="Rol"      deger={kullanici?.rol ?? '—'} />
        <BilgiSatiri emoji="🔑" label="Kullanıcı ID" deger={String(kullanici?.id ?? '—')} />
      </View>

      {/* ── Şifre Değiştir ── */}
      <View style={s.kart}>
        <Text style={s.kartBaslik}>Şifre Değiştir</Text>

        <SifreInput
          label="Mevcut Şifre"
          value={eskiSifre}
          onChange={setEskiSifre}
          gorunur={eskiGorunur}
          onToggle={() => setEskiGorunur(v => !v)}
        />
        <SifreInput
          label="Yeni Şifre"
          value={yeniSifre}
          onChange={setYeniSifre}
          gorunur={yeniGorunur}
          onToggle={() => setYeniGorunur(v => !v)}
          altBilgi={yeniSifre.length > 0 && yeniSifre.length < 6
            ? 'En az 6 karakter gerekli'
            : undefined}
        />
        <SifreInput
          label="Yeni Şifre (Tekrar)"
          value={tekrarSifre}
          onChange={setTekrarSifre}
          gorunur={tekrarGorunur}
          onToggle={() => setTekrarGorunur(v => !v)}
          eslesme={yeniSifreUyusuyor}
        />

        <TouchableOpacity
          style={[s.buton, gonderiliyor && s.butonDevre]}
          onPress={sifreDegistir}
          disabled={gonderiliyor}
          activeOpacity={0.8}
        >
          {gonderiliyor
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.butonYazi}>Şifreyi Güncelle</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Çıkış ── */}
      <TouchableOpacity style={s.cikisBut} onPress={cikisOnay} activeOpacity={0.8}>
        <Text style={s.cikisYazi}>🚪  Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Alt Bileşenler ────────────────────────────────────────────────────────────

function BilgiSatiri({ emoji, label, deger }: { emoji: string; label: string; deger: string }) {
  return (
    <View style={s.bilgiSatir}>
      <Text style={s.bilgiEmoji}>{emoji}</Text>
      <Text style={s.bilgiLabel}>{label}</Text>
      <Text style={s.bilgiDeger} numberOfLines={1}>{deger}</Text>
    </View>
  );
}

interface SifreInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  gorunur: boolean;
  onToggle: () => void;
  altBilgi?: string;
  eslesme?: boolean | null;
}

function SifreInput({ label, value, onChange, gorunur, onToggle, altBilgi, eslesme }: SifreInputProps) {
  const kenarRenk = eslesme === true
    ? '#43a047'
    : eslesme === false
    ? '#ef5350'
    : '#37474f';

  return (
    <View style={s.inputKap}>
      <Text style={s.inputLabel}>{label}</Text>
      <View style={[s.inputSarir, { borderColor: kenarRenk }]}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!gorunur}
          placeholder="••••••"
          placeholderTextColor="#546e7a"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={onToggle} style={s.gozBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.gozIkon}>{gorunur ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>
      {altBilgi ? (
        <Text style={s.altBilgi}>{altBilgi}</Text>
      ) : eslesme === true ? (
        <Text style={[s.altBilgi, { color: '#43a047' }]}>Şifreler eşleşiyor</Text>
      ) : eslesme === false ? (
        <Text style={[s.altBilgi, { color: '#ef5350' }]}>Şifreler eşleşmiyor</Text>
      ) : null}
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  kap:    { flex: 1, backgroundColor: '#0f1923' },
  icerik: { padding: 16, gap: 16, paddingBottom: 48 },

  avatarKap: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: '#0288d1',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4fc3f7', shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  avatarHarf:   { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  kullaniciAdi: { fontSize: 20, fontWeight: '700', color: '#eceff1' },
  rolBadge: {
    backgroundColor: '#1c2a36', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: '#4fc3f733',
  },
  rolYazi: { fontSize: 12, color: '#4fc3f7', fontWeight: '600' },

  kart: {
    backgroundColor: '#1c2a36', borderRadius: 14, padding: 16, gap: 14,
    borderWidth: 1, borderColor: '#263545',
  },
  kartBaslik: { fontSize: 13, fontWeight: '700', color: '#90caf9', marginBottom: 2 },

  bilgiSatir: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bilgiEmoji: { fontSize: 16, width: 24 },
  bilgiLabel: { fontSize: 13, color: '#78909c', flex: 1 },
  bilgiDeger: { fontSize: 13, color: '#eceff1', fontWeight: '600', flexShrink: 1, maxWidth: '55%' },

  inputKap:   { gap: 6 },
  inputLabel: { fontSize: 12, color: '#90a4ae', fontWeight: '600' },
  inputSarir: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#263545', borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 14,
  },
  input: {
    flex: 1, color: '#eceff1', fontSize: 14,
    paddingVertical: 11,
  },
  gozBtn: { paddingLeft: 8 },
  gozIkon: { fontSize: 16 },
  altBilgi: { fontSize: 11, color: '#ef5350', marginTop: 2 },

  buton: {
    backgroundColor: '#0288d1', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  butonDevre: { opacity: 0.6 },
  butonYazi:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  cikisBut: {
    backgroundColor: '#2d1515', borderRadius: 12,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#ef535044',
  },
  cikisYazi: { color: '#ef5350', fontWeight: '700', fontSize: 15 },
});

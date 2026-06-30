import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import VersionEtiketi from '../components/VersionEtiketi';

export default function LoginScreen() {
  const { girisYap } = useAuth();
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [sifre, setSifre] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  const handleGiris = async () => {
    if (!kullaniciAdi.trim() || !sifre.trim()) {
      Alert.alert('Uyarı', 'Kullanıcı adı ve şifre gereklidir.');
      return;
    }
    setYukleniyor(true);
    try {
      await girisYap(kullaniciAdi.trim(), sifre);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { hataMesaj?: string } } })?.response?.data?.hataMesaj ?? 'Bağlantı hatası. API erişilebilir mi?';
      Alert.alert('Giriş Hatası', msg);
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.versiyon}>
        <VersionEtiketi />
      </View>
      <View style={s.card}>
        <Text style={s.logo}>PERA</Text>
        <Text style={s.subtitle}>Pakset ERP Rehber Asistanı</Text>

        <TextInput
          style={s.input}
          placeholder="Kullanıcı Adı"
          placeholderTextColor="#888"
          value={kullaniciAdi}
          onChangeText={setKullaniciAdi}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />
        <TextInput
          style={s.input}
          placeholder="Şifre"
          placeholderTextColor="#888"
          value={sifre}
          onChangeText={setSifre}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleGiris}
        />

        <TouchableOpacity
          style={[s.btn, yukleniyor && s.btnDisabled]}
          onPress={handleGiris}
          disabled={yukleniyor}
        >
          {yukleniyor ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Giriş Yap</Text>}
        </TouchableOpacity>

        <Text style={s.footer}>Pakset Yazılım © 2026</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:  { flexGrow: 1, backgroundColor: '#0f1923', justifyContent: 'center', alignItems: 'center', padding: 24 },
  versiyon:   { position: 'absolute', top: 48, right: 16 },
  card:       { width: '100%', maxWidth: 420, backgroundColor: '#1c2a36', borderRadius: 16, padding: 36, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16 },
  logo:       { fontSize: 48, fontWeight: 'bold', color: '#4fc3f7', letterSpacing: 6, marginBottom: 4 },
  subtitle:   { fontSize: 13, color: '#90a4ae', marginBottom: 32 },
  input:      { width: '100%', backgroundColor: '#263545', color: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#37474f' },
  btn:        { width: '100%', backgroundColor: '#0288d1', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer:     { marginTop: 24, color: '#546e7a', fontSize: 11 },
});

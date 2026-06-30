import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../services/api';
import { ENV } from '../config/env';

interface Kullanici {
  id: number;
  adi: string;
  email?: string;
  rol?: string;
}

interface AuthContextType {
  kullanici: Kullanici | null;
  yukleniyor: boolean;
  girisYap: (kullaniciAdi: string, sifre: string) => Promise<void>;
  cikisYap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [kullanici, setKullanici] = useState<Kullanici | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const userJson = await SecureStore.getItemAsync(ENV.USER_KEY);
        const token = await SecureStore.getItemAsync(ENV.TOKEN_KEY);
        if (userJson && token) setKullanici(JSON.parse(userJson));
      } catch {}
      setYukleniyor(false);
    })();
  }, []);

  const girisYap = async (kullaniciAdi: string, sifre: string) => {
    const res = await authApi.giris(kullaniciAdi, sifre);
    const { token, refreshToken, kullanici: k } = res.data;
    await SecureStore.setItemAsync(ENV.TOKEN_KEY, token);
    if (refreshToken) await SecureStore.setItemAsync('pera_refresh_token', refreshToken);
    await SecureStore.setItemAsync(ENV.USER_KEY, JSON.stringify(k));
    setKullanici(k);
  };

  const cikisYap = async () => {
    await SecureStore.deleteItemAsync(ENV.TOKEN_KEY);
    await SecureStore.deleteItemAsync('pera_refresh_token');
    await SecureStore.deleteItemAsync(ENV.USER_KEY);
    setKullanici(null);
  };

  return (
    <AuthContext.Provider value={{ kullanici, yukleniyor, girisYap, cikisYap }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

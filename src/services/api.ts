import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { ENV } from '../config/env';

const api = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'X-Firma-No': ENV.FIRMA_NO,
    'X-Donem-No': ENV.DONEM_NO,
  },
});

const REFRESH_KEY = 'pera_refresh_token';
let tokenYenileniyor = false;
let yenilemeKuyrugu: Array<(token: string | null) => void> = [];

async function tokenOku(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(ENV.TOKEN_KEY); } catch { return null; }
}

async function refreshTokenYenile(): Promise<string | null> {
  if (tokenYenileniyor) {
    return new Promise((resolve) => { yenilemeKuyrugu.push(resolve); });
  }
  tokenYenileniyor = true;
  try {
    const rt = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!rt) return null;

    const res = await axios.post(`${ENV.API_BASE_URL}/api/auth/yenile`, { refreshToken: rt });
    const { token, refreshToken: yeniRt } = res.data;
    await SecureStore.setItemAsync(ENV.TOKEN_KEY, token);
    if (yeniRt) await SecureStore.setItemAsync(REFRESH_KEY, yeniRt);
    yenilemeKuyrugu.forEach(cb => cb(token));
    return token;
  } catch {
    yenilemeKuyrugu.forEach(cb => cb(null));
    return null;
  } finally {
    tokenYenileniyor = false;
    yenilemeKuyrugu = [];
  }
}

api.interceptors.request.use(async (config) => {
  const token = await tokenOku();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig = err.config;
    if (err.response?.status === 401 && !orig._retry) {
      orig._retry = true;
      const yeniToken = await refreshTokenYenile();
      if (yeniToken) {
        orig.headers.Authorization = `Bearer ${yeniToken}`;
        return api(orig);
      }
      try { await SecureStore.deleteItemAsync(ENV.TOKEN_KEY); } catch {}
      try { await SecureStore.deleteItemAsync(REFRESH_KEY); } catch {}
      try { await SecureStore.deleteItemAsync(ENV.USER_KEY); } catch {}
    }
    return Promise.reject(err);
  },
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  giris: (kullaniciAdi: string, sifre: string) =>
    api.post('/api/auth/giris', { kullaniciAdi, sifre }),
};

// ── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatGecmisItem {
  rol: 'kullanici' | 'pera';
  metin: string;
}

export const chatApi = {
  sor: (soru: string, gecmis: ChatGecmisItem[] = []) =>
    api.post('/api/chat/sor', { soru, gecmis }),
  gecmis: (sayfa = 1) => api.get(`/api/chat/gecmis?sayfa=${sayfa}`),
};

// ── Ses → STT ────────────────────────────────────────────────────────────────
export const sesApi = {
  cevir: async (audioUri: string): Promise<string> => {
    const formData = new FormData();
    formData.append('audio', {
      uri: audioUri,
      type: 'audio/mp4',
      name: 'kayit.mp4',
    } as unknown as Blob);

    const res = await api.post('/api/ses/cevir', formData, {
      timeout: ENV.AUDIO_UPLOAD_TIMEOUT_MS,
      transformRequest: (data, headers) => {
        delete headers['Content-Type'];
        return data;
      },
    });
    return (res.data?.metin as string) ?? '';
  },
};

// ── Mail ─────────────────────────────────────────────────────────────────────
export interface MailKullanici {
  ad: string;
  email: string;
}

export const mailApi = {
  kullanicilar: () => api.get<MailKullanici[]>('/api/mail/kullanicilar'),
  gonder: (AliciEmail: string, Konu: string, Icerik: string) =>
    api.post('/api/mail/gonder', { AliciEmail, Konu, Icerik }),
};

// ── Görev ────────────────────────────────────────────────────────────────────
export interface GorevOzet {
  id: number;
  baslik: string;
  durum: 0 | 1 | 2 | 3;
  oncelik: 1 | 2 | 3;
  atayanAdi: string;
  atananAdi: string;
  sonTarih?: string;
  gecikmiMi: boolean;
}

export interface GorevDetay extends GorevOzet {
  aciklama?: string;
  atayanId: number;
  atananId: number;
  olusturmaTarihi: string;
}

export interface GorevYorum {
  id: number;
  kullaniciId: number;
  kullaniciAdi: string;
  yorum: string;
  tarih: string;
}

export interface EkipUye {
  kullaniciId: number;
  adSoyad: string;
  departman: string;
  aktifGorevSayisi: number;
}

export const gorevApi = {
  liste:         (tip: 'bana' | 'atadim')            => api.get<GorevOzet[]>(`/api/gorev?tip=${tip}`),
  detay:         (id: number)                         => api.get<GorevDetay>(`/api/gorev/${id}`),
  ekibim:        ()                                   => api.get<EkipUye[]>('/api/gorev/ekibim'),
  olustur:       (data: {
    atananId: number; baslik: string; aciklama?: string;
    oncelik: number; sonTarih?: string;
  })                                                  => api.post('/api/gorev', data),
  durumGuncelle: (id: number, durum: number)          => api.put(`/api/gorev/${id}/durum`, { durum }),
  yorumlar:      (id: number)                         => api.get<GorevYorum[]>(`/api/gorev/${id}/yorumlar`),
  yorumEkle:     (id: number, yorum: string)          => api.post(`/api/gorev/${id}/yorum`, { yorum }),
};

// ── Kullanıcı ────────────────────────────────────────────────────────────────
export const kullaniciApi = {
  sifreDegistir: (eskiSifre: string, yeniSifre: string) =>
    api.post('/api/kullanici/sifre-degistir', { eskiSifre, yeniSifre }),
  fcmTokenKaydet: (token: string, platform: string) =>
    api.post('/api/kullanici/fcm-token', { token, platform }),
};

export default api;

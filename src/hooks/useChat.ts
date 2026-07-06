import { useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatApi, sesApi, ChatGecmisItem } from '../services/api';
import { ENV } from '../config/env';

export type MesajTipi = 'kullanici' | 'pera' | 'hata' | 'sistem';

export interface Mesaj {
  id: string;
  tip: MesajTipi;
  metin: string;
  sureMs?: number;
  cachtenGeldi?: boolean;
  grafikVerisi?: unknown;
  orijinalSoru?: string;
}

export interface SohbetKayit {
  id: number;
  tarih: string;
  ozet: string;
  mesajlar: Mesaj[];
}

function yeniId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useChat() {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sesYukleniyor, setSesYukleniyor] = useState(false);
  const [gecmis, setGecmis] = useState<SohbetKayit[]>([]);

  const gecmisRef = useRef<ChatGecmisItem[]>([]);
  const sohbetGecmisRef = useRef<SohbetKayit[]>([]);
  // React state (yukleniyor) senkron degil - iki hizli ust uste 'sor' cagrisi
  // (ayni event-loop tick'inde, ör. barge-in ile art arda soru) her ikisi de
  // henuz guncellenmemis "false" degerini gorebilir. Bu ref, ilk cagrida ANINDA
  // set edilerek ikinci cagriyi state re-render'i beklemeden engeller.
  const yukleniyorRef = useRef(false);

  const gecmisYukle = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(ENV.CHAT_HISTORY_KEY);
      if (raw) {
        const parsed: SohbetKayit[] = JSON.parse(raw);
        sohbetGecmisRef.current = parsed;
        setGecmis(parsed);
      }
    } catch {}
  }, []);

  const sohbetKaydet = useCallback(async (msgs: Mesaj[]) => {
    if (!msgs.length) return;
    const kayit: SohbetKayit = {
      id: Date.now(),
      tarih: new Date().toISOString(),
      ozet: msgs.find((m) => m.tip === 'kullanici')?.metin?.slice(0, 80) ?? '(sohbet)',
      mesajlar: msgs,
    };
    const yeni = [kayit, ...sohbetGecmisRef.current].slice(0, ENV.MAX_CHAT_HISTORY);
    sohbetGecmisRef.current = yeni;
    setGecmis(yeni);
    await AsyncStorage.setItem(ENV.CHAT_HISTORY_KEY, JSON.stringify(yeni)).catch(() => {});
  }, []);

  const yeniSohbet = useCallback(async () => {
    if (mesajlar.length) await sohbetKaydet(mesajlar);
    setMesajlar([]);
    gecmisRef.current = [];
  }, [mesajlar, sohbetKaydet]);

  const mesajEkle = useCallback((m: Omit<Mesaj, 'id'>): Mesaj => {
    const mesaj: Mesaj = { ...m, id: yeniId() };
    setMesajlar((prev) => [...prev, mesaj]);
    return mesaj;
  }, []);

  const sor = useCallback(
    async (metin: string): Promise<string | null> => {
      if (!metin.trim() || yukleniyorRef.current) return null;
      yukleniyorRef.current = true;

      mesajEkle({ tip: 'kullanici', metin: metin.trim() });

      const konusmaGecmisi = gecmisRef.current.slice(-6);
      setYukleniyor(true);
      try {
        const res = await chatApi.sor(metin.trim(), konusmaGecmisi);
        const d = res.data;

        // PERA-API'nin gerçek yanıt sözleşmesi: sohbet (selamlama) | belirsizlik
        // (netleştirme seçenekleri) | success=false (hata) | success=true+yorum (normal cevap).
        let cevapMetni: string;
        let tip: MesajTipi = 'pera';

        if (d.sohbet) {
          cevapMetni = d.sohbet;
        } else if (d.belirsizlik) {
          const secenekler: string[] = d.belirsizlik.secenekler ?? [];
          const secenekMetni = secenekler.map((s, i) => `${i + 1}. ${s}`).join('\n');
          cevapMetni = secenekMetni ? `${d.belirsizlik.soru}\n\n${secenekMetni}` : d.belirsizlik.soru;
        } else if (d.success === false) {
          cevapMetni = d.kullaniciMesaji || d.error || 'Yanıt alınamadı.';
          tip = 'hata';
        } else {
          cevapMetni = d.yorum || 'Yanıt alınamadı.';
        }

        mesajEkle({ tip, metin: cevapMetni, grafikVerisi: d.grafikUrl });

        gecmisRef.current = [
          ...konusmaGecmisi,
          { rol: 'kullanici' as const, metin: metin.trim() },
          { rol: 'pera' as const, metin: cevapMetni },
        ].slice(-10);

        return cevapMetni;
      } catch (err: unknown) {
        const data = (err as { response?: { data?: { kullaniciMesaji?: string; error?: string } } })?.response?.data;
        const msg = data?.kullaniciMesaji || data?.error || 'Bağlantı hatası.';
        mesajEkle({ tip: 'hata', metin: msg, orijinalSoru: metin.trim() });
        return null;
      } finally {
        setYukleniyor(false);
      }
    },
    [yukleniyor, mesajEkle],
  );

  const sesleGonder = useCallback(
    async (audioUri: string): Promise<string | null> => {
      setSesYukleniyor(true);
      let transcript = '';
      try {
        transcript = await sesApi.cevir(audioUri);
      } catch {
        mesajEkle({ tip: 'sistem', metin: 'Ses dosyası yüklenemedi.' });
        setSesYukleniyor(false);
        return null;
      } finally {
        setSesYukleniyor(false);
      }
      if (!transcript.trim()) {
        mesajEkle({ tip: 'sistem', metin: 'Ses anlaşılamadı, tekrar deneyin.' });
        return null;
      }
      return sor(transcript);
    },
    [sor, mesajEkle],
  );

  const tekrarDene = useCallback(
    (orijinalSoru: string) => sor(orijinalSoru),
    [sor],
  );

  return {
    mesajlar,
    setMesajlar,
    yukleniyor,
    sesYukleniyor,
    gecmis,
    gecmisYukle,
    yeniSohbet,
    sor,
    sesleGonder,
    tekrarDene,
  };
}

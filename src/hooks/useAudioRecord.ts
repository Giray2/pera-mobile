import { useState, useRef, useCallback } from 'react';
import { useAudioRecorder } from 'expo-audio';
import { KAYIT_AYARLARI, kayitBaslat, kayitBitir, kayitIptal } from '../services/audio';

export function useAudioRecord(onBitti: (uri: string) => void) {
  const recorder = useAudioRecorder(KAYIT_AYARLARI);
  const [kayitYapiliyor, setKayitYapiliyor] = useState(false);
  const iptalRef = useRef(false);

  const basla = useCallback(async () => {
    if (kayitYapiliyor) return;
    iptalRef.current = false;
    try {
      await kayitBaslat(recorder);
      setKayitYapiliyor(true);
    } catch {
      setKayitYapiliyor(false);
    }
  }, [kayitYapiliyor, recorder]);

  const bitir = useCallback(async () => {
    if (!kayitYapiliyor) return;
    setKayitYapiliyor(false);
    const uri = await kayitBitir(recorder);
    if (uri && !iptalRef.current) onBitti(uri);
  }, [kayitYapiliyor, onBitti, recorder]);

  const iptal = useCallback(async () => {
    iptalRef.current = true;
    setKayitYapiliyor(false);
    await kayitIptal(recorder);
  }, [recorder]);

  return { kayitYapiliyor, basla, bitir, iptal };
}

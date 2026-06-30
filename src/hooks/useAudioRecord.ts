import { useState, useRef, useCallback } from 'react';
import { kayitBaslat, kayitBitir, kayitIptal } from '../services/audio';

export function useAudioRecord(onBitti: (uri: string) => void) {
  const [kayitYapiliyor, setKayitYapiliyor] = useState(false);
  const iptalRef = useRef(false);

  const basla = useCallback(async () => {
    if (kayitYapiliyor) return;
    iptalRef.current = false;
    try {
      await kayitBaslat();
      setKayitYapiliyor(true);
    } catch {
      setKayitYapiliyor(false);
    }
  }, [kayitYapiliyor]);

  const bitir = useCallback(async () => {
    if (!kayitYapiliyor) return;
    setKayitYapiliyor(false);
    const uri = await kayitBitir();
    if (uri && !iptalRef.current) onBitti(uri);
  }, [kayitYapiliyor, onBitti]);

  const iptal = useCallback(async () => {
    iptalRef.current = true;
    setKayitYapiliyor(false);
    await kayitIptal();
  }, []);

  return { kayitYapiliyor, basla, bitir, iptal };
}

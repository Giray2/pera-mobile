import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { kullaniciApi } from '../services/api';

export const BILDIRIM_KANAL_ID = 'pera-gorev-kanal';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function kanalOlustur() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(BILDIRIM_KANAL_ID, {
    name: 'PERA Görev Bildirimleri',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4fc3f7',
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

async function fcmTokenKaydet(): Promise<void> {
  for (let deneme = 0; deneme < 3; deneme++) {
    try {
      const sonuc = await Notifications.getDevicePushTokenAsync();
      const fcmToken = sonuc.data as string;
      if (fcmToken) {
        await kullaniciApi.fcmTokenKaydet(fcmToken, 'android');
        console.log('[PERA-FCM] Token kaydedildi:', fcmToken.substring(0, 20) + '...');
        return;
      }
    } catch (e) {
      console.log(`[PERA-FCM] Token alınamadı (deneme ${deneme + 1}):`, e instanceof Error ? e.message : String(e));
      if (deneme < 2) await new Promise(r => setTimeout(r, 2000 * (deneme + 1)));
    }
  }
}

export function useBildirim(
  kullaniciGirisYapti: boolean,
  onGorevBildirimTikla?: (gorevId: number) => void,
) {
  const gelenDinleyici = useRef<Notifications.EventSubscription | null>(null);
  const tiklamaDinleyici = useRef<Notifications.EventSubscription | null>(null);
  const tokenDinleyici = useRef<Notifications.EventSubscription | null>(null);
  const callbackRef = useRef(onGorevBildirimTikla);
  callbackRef.current = onGorevBildirimTikla;

  useEffect(() => {
    if (!kullaniciGirisYapti) return;

    const kurulum = async () => {
      if (Platform.OS !== 'android') return;

      await kanalOlustur();

      const { status: mevcut } = await Notifications.getPermissionsAsync();
      let izin = mevcut;
      if (mevcut !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        izin = status;
      }
      if (izin !== 'granted') {
        console.log('[PERA-FCM] Bildirim izni verilmedi:', izin);
        return;
      }

      await fcmTokenKaydet();

      // Uygulama kapalıyken bildirimine tıklanarak açıldıysa (soğuk başlangıç)
      try {
        const sonrakiCevap = await Notifications.getLastNotificationResponseAsync();
        if (sonrakiCevap) {
          const gorevId = sonrakiCevap.notification.request.content.data?.gorevId as number | undefined;
          if (gorevId) {
            // Navigasyon hazır olana kadar kısa gecikme
            setTimeout(() => callbackRef.current?.(gorevId), 500);
          }
        }
      } catch (e) {
        console.log('[PERA-FCM] Son bildirim okunamadı:', e instanceof Error ? e.message : String(e));
      }
    };

    kurulum();

    // Uygulama ön plandayken gelen bildirim
    gelenDinleyici.current = Notifications.addNotificationReceivedListener(bildirim => {
      console.log('[PERA-FCM] Bildirim geldi:', bildirim.request.content.title);
    });

    // Kullanıcı bildirime tıkladığında
    tiklamaDinleyici.current = Notifications.addNotificationResponseReceivedListener(cevap => {
      const gorevId = cevap.notification.request.content.data?.gorevId as number | undefined;
      console.log('[PERA-FCM] Bildirime tıklandı, gorevId:', gorevId);
      if (gorevId) callbackRef.current?.(gorevId);
    });

    // FCM token yenilendiğinde (uygulama yeniden kurulum, token rotasyonu) backend'e güncelle
    tokenDinleyici.current = Notifications.addPushTokenListener(async (pushToken) => {
      try {
        await kullaniciApi.fcmTokenKaydet(pushToken.data, pushToken.type ?? 'android');
        console.log('[PERA-FCM] Token otomatik güncellendi');
      } catch (e) {
        console.log('[PERA-FCM] Token güncelleme hatası:', e instanceof Error ? e.message : String(e));
      }
    });

    return () => {
      gelenDinleyici.current?.remove();
      tiklamaDinleyici.current?.remove();
      tokenDinleyici.current?.remove();
    };
  }, [kullaniciGirisYapti]);
}

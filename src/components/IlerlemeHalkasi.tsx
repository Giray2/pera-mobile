import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  yuzde: number;
  boyut?: number;
  kalinlik?: number;
  renk?: string;
  arkaPlan?: string;
  children?: React.ReactNode;
}

export default function IlerlemeHalkasi({
  yuzde,
  boyut = 120,
  kalinlik = 10,
  renk = '#4fc3f7',
  arkaPlan = '#263545',
  children,
}: Props) {
  const yarici = boyut / 2;
  const p = Math.min(100, Math.max(0, yuzde));

  // Sağ clip: 0%→50% arası doldurmak için -135°'den 45°'ye döner
  const sagRotasyon = -135 + (Math.min(p, 50) / 50) * 180;
  // Sol clip: 50%→100% arası doldurmak için -135°'den 45°'ye döner
  const solRotasyon = -135 + (Math.max(0, p - 50) / 50) * 180;

  return (
    <View style={{ width: boyut, height: boyut }}>
      {/* Pist (arka plan halkası) */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: yarici, borderWidth: kalinlik, borderColor: arkaPlan },
        ]}
      />

      {/* Sağ yarım clip: üst+sağ kenarlık renkli, döndürülerek saat yönünde doldurulur */}
      <View
        style={{
          position: 'absolute',
          left: yarici,
          width: yarici,
          height: boyut,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: -yarici,
            width: boyut,
            height: boyut,
            borderRadius: yarici,
            borderWidth: kalinlik,
            borderTopColor: renk,
            borderRightColor: renk,
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
            transform: [{ rotate: `${sagRotasyon}deg` }],
          }}
        />
      </View>

      {/* Sol yarım clip: alt+sol kenarlık renkli */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          width: yarici,
          height: boyut,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            width: boyut,
            height: boyut,
            borderRadius: yarici,
            borderWidth: kalinlik,
            borderBottomColor: renk,
            borderLeftColor: renk,
            borderTopColor: 'transparent',
            borderRightColor: 'transparent',
            transform: [{ rotate: `${solRotasyon}deg` }],
          }}
        />
      </View>

      {children && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: 'center', alignItems: 'center' },
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}

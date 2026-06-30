import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  kayitYapiliyor: boolean;
  sesYukleniyor: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  disabled?: boolean;
}

export function AudioRecordButton({ kayitYapiliyor, sesYukleniyor, onPressIn, onPressOut, disabled }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (kayitYapiliyor) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [kayitYapiliyor, pulseAnim]);

  const icon = sesYukleniyor ? '⏳' : kayitYapiliyor ? '⏹' : '🎤';
  const hint = sesYukleniyor ? 'Gönderiliyor...' : kayitYapiliyor ? 'Bırak → Gönder' : 'Bas ve konuş';

  return (
    <View style={s.container}>
      <Animated.View style={{ transform: [{ scale: kayitYapiliyor ? pulseAnim : 1 }] }}>
        <TouchableOpacity
          style={[s.btn, kayitYapiliyor && s.btnAktif, (disabled || sesYukleniyor) && s.btnDisabled]}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled || sesYukleniyor}
          activeOpacity={0.7}
        >
          <Text style={s.icon}>{icon}</Text>
        </TouchableOpacity>
      </Animated.View>
      <Text style={s.hint}>{hint}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { alignItems: 'center', gap: 3 },
  btn:         { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1c2a36', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#4fc3f7' },
  btnAktif:    { backgroundColor: '#6a1b9a', borderColor: '#ce93d8' },
  btnDisabled: { opacity: 0.4 },
  icon:        { fontSize: 22 },
  hint:        { fontSize: 9, color: '#546e7a' },
});

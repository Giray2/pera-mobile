import React from 'react';
import { Text, StyleSheet } from 'react-native';

export default function VersionEtiketi() {
  return <Text style={s.etiket}>v2.1.0</Text>;
}

const s = StyleSheet.create({
  etiket: {
    fontSize: 10,
    color: '#546e7a',
    letterSpacing: 0.5,
    marginRight: 4,
  },
});

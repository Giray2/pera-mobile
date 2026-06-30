import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useBildirim } from '../hooks/useBildirim';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import GorevlerScreen from '../screens/GorevlerScreen';
import GorevDetayScreen from '../screens/GorevDetayScreen';
import GorevOlusturScreen from '../screens/GorevOlusturScreen';
import { ActivityIndicator, View, Text } from 'react-native';
import VersionEtiketi from '../components/VersionEtiketi';
import OzetScreen from '../screens/OzetScreen';
import ProfilScreen from '../screens/ProfilScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// Navigasyon bileşeni dışından (bildirim handler'ı gibi) navigate edebilmek için ref
export const navigationRef = createNavigationContainerRef<any>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 11, color: focused ? '#4fc3f7' : '#546e7a', marginTop: 2 }}>
      {label}
    </Text>
  );
}

function AnaSayfaTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1c2a36' },
        headerTintColor: '#4fc3f7',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => <VersionEtiketi />,
        tabBarStyle: {
          backgroundColor: '#1c2a36',
          borderTopColor: '#263545',
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#4fc3f7',
        tabBarInactiveTintColor: '#546e7a',
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Ana Sayfa',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20 }}>{focused ? '🏠' : '🏠'}</Text>,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          title: 'PERA Asistan',
          tabBarLabel: 'Asistan',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20 }}>{focused ? '🤖' : '🤖'}</Text>,
        }}
      />
      <Tab.Screen
        name="Gorevler"
        component={GorevlerScreen}
        options={{
          title: 'Görevler',
          tabBarLabel: 'Görevler',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20 }}>{focused ? '✅' : '📋'}</Text>,
        }}
      />
      <Tab.Screen
        name="Ozet"
        component={OzetScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Özet',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20 }}>{focused ? '📊' : '📈'}</Text>,
        }}
      />
      <Tab.Screen
        name="Profil"
        component={ProfilScreen}
        options={{
          title: 'Profil',
          tabBarLabel: 'Profil',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20 }}>{focused ? '👤' : '👤'}</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

// NavigationContainer içinde çalışarak hem auth'a hem navigasyona erişir
function BildirimYonetici({ kullanici }: { kullanici: boolean }) {
  useBildirim(kullanici, (gorevId: number) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('GorevDetay', { gorevId });
    }
  });
  return null;
}

export default function AppNavigator() {
  const { kullanici, yukleniyor } = useAuth();

  if (yukleniyor) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1923' }}>
        <ActivityIndicator size="large" color="#4fc3f7" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <BildirimYonetici kullanici={!!kullanici} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1c2a36' },
          headerTintColor: '#4fc3f7',
          headerTitleStyle: { fontWeight: '600' },
          headerRight: () => <VersionEtiketi />,
        }}
      >
        {kullanici ? (
          <>
            <Stack.Screen name="Ana" component={AnaSayfaTabs} options={{ headerShown: false }} />
            <Stack.Screen name="GorevDetay" component={GorevDetayScreen} />
            <Stack.Screen name="GorevOlustur" component={GorevOlusturScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

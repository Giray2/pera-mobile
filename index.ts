import { registerRootComponent } from 'expo';

import App from './App';
import { ENV } from './src/config/env';

// Üretim build'inde tanı loglarını sustur — canlı cihaz teşhisi gerektiğinde
// ENV.DEBUG_LOG=true yapıp yeniden build alınır (bkz. env.ts notu).
if (!__DEV__ && !ENV.DEBUG_LOG) {
  console.log = () => {};
  console.debug = () => {};
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

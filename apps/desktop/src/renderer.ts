import { createApp } from 'vue';
import App from './App.vue';
import { APP_LOCALE_STORAGE_KEY, createAppI18n, resolveAppLocale } from './app/i18n';
import './index.css';
import 'vue-sonner/style.css';

let storedLocale: string | null = null;

try {
  storedLocale = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
} catch {
  // Fall back to the operating system language if storage is unavailable.
}

const locale = resolveAppLocale(navigator.languages, storedLocale);
const app = createApp(App);

document.documentElement.lang = locale;

app.use(createAppI18n(locale));
app.mount('#app');

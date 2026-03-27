export type TranslationMap = Record<string, Record<string, string>>;

export const DEFAULT_TRANSLATIONS: TranslationMap = {
  en: {
    hello: "Hello",
    "home.auth": "Authenticated user",
    "home.toggleAuth": "Toggle auth",
  },
  pt: {
    hello: "Ola",
    "home.auth": "Usuario autenticado",
    "home.toggleAuth": "Alternar auth",
  },
};

export class I18nService {
  private locale: string;
  private translations: TranslationMap;

  constructor(
    initialTranslations: TranslationMap = DEFAULT_TRANSLATIONS,
    initialLocale = "pt",
  ) {
    this.translations = { ...initialTranslations };
    this.locale = initialLocale;
  }

  setLocale(locale: string): void {
    this.locale = locale;
  }

  getLocale(): string {
    return this.locale;
  }

  registerTranslations(locale: string, values: Record<string, string>): void {
    this.translations[locale] = {
      ...(this.translations[locale] ?? {}),
      ...values,
    };
  }

  t(key: string): string {
    return (
      this.translations[this.locale]?.[key] ??
      this.translations.en?.[key] ??
      key
    );
  }
}

export function useI18n(lang: string) {
  const i18n = new I18nService(DEFAULT_TRANSLATIONS, lang);
  return {
    t: (key: string) => i18n.t(key),
  };
}

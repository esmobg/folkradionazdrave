// This shared content module is loaded by both the Vite app and Node-based QA scripts.
const runtimeEnv = import.meta.env ?? globalThis.process?.env ?? {};

function getBrowserSafeStreamUrl(configValue, fallbackPath) {
  const nextValue = configValue || fallbackPath;

  if (typeof window === "undefined") {
    return nextValue;
  }

  const normalizedValue = String(nextValue).trim();
  const looksLikeInsecureExternalStream =
    /^http:\/\//i.test(normalizedValue) || /^[a-z0-9.-]+(?::\d+)(?:\/.*)?$/i.test(normalizedValue);

  if (window.location.protocol === "https:" && looksLikeInsecureExternalStream) {
    return new URL(fallbackPath, window.location.origin).toString();
  }

  return normalizedValue;
}

function appendQueryParam(url, key, value) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function isProxyBackedStreamUrl(url, fallbackPath) {
  const normalizedUrl = String(url).trim();

  if (typeof window === "undefined") {
    return normalizedUrl === fallbackPath || normalizedUrl.startsWith(`${fallbackPath}?`);
  }

  try {
    const resolved = new URL(normalizedUrl, window.location.origin);
    return resolved.origin === window.location.origin && resolved.pathname === fallbackPath;
  } catch {
    return false;
  }
}

function isExternalStreamProxyUrl(url) {
  const normalizedUrl = String(url).trim();

  if (!normalizedUrl || !/^https:\/\//i.test(normalizedUrl)) {
    return false;
  }

  try {
    const resolved = new URL(normalizedUrl);

    if (typeof window !== "undefined" && resolved.origin === window.location.origin) {
      return false;
    }

    return resolved.pathname === "/api/stream/nazdrave" || resolved.pathname === "/api/stream/gold";
  } catch {
    return false;
  }
}

function createSameOriginFallbackUrls(fallbackPath, variantCount) {
  if (typeof window === "undefined") {
    return [fallbackPath];
  }

  const sameOriginUrl = new URL(fallbackPath, window.location.origin).toString();

  return Array.from({ length: variantCount }, (_value, index) =>
    appendQueryParam(sameOriginUrl, "client", index),
  );
}

function createRetryableStreamUrls(configValue, fallbackPath, variantCount = 1) {
  const primaryUrl = getBrowserSafeStreamUrl(configValue, fallbackPath);

  // Prefer Cloudflare Worker / Pages proxy URLs only — do not fall back to
  // same-origin Netlify Functions (those burned account bandwidth).
  if (isExternalStreamProxyUrl(primaryUrl)) {
    return Array.from({ length: variantCount }, (_value, index) =>
      appendQueryParam(primaryUrl, "client", index),
    );
  }

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    const sameOriginUrl = new URL(fallbackPath, window.location.origin).toString();

    if (isProxyBackedStreamUrl(sameOriginUrl, fallbackPath)) {
      return createSameOriginFallbackUrls(fallbackPath, variantCount);
    }

    return [sameOriginUrl];
  }

  const urls = [];

  if (isProxyBackedStreamUrl(primaryUrl, fallbackPath)) {
    for (let index = 0; index < variantCount; index += 1) {
      urls.push(appendQueryParam(primaryUrl, "client", index));
    }
  } else {
    urls.push(primaryUrl);
  }

  return [...new Set(urls)];
}

const goldStreamUrls = createRetryableStreamUrls(runtimeEnv.VITE_GOLD_STREAM_URL, "/api/stream/gold");
const nazdraveStreamUrls = createRetryableStreamUrls(runtimeEnv.VITE_NAZDRAVE_STREAM_URL, "/api/stream/nazdrave");
const showGoldStation = runtimeEnv.VITE_ENABLE_GOLD_STATION !== "false";

const stationDefinitions = {
  nazdrave: {
    id: "nazdrave",
    urls: nazdraveStreamUrls,
    nowPlayingUrl: null,
    names: {
      bg: "Фолк Радио Наздраве",
      en: "Folk Radio Nazdrave",
    },
    subtitles: {
      bg: "Поп-фолк, народна и балканска музика 24/7",
      en: "Pop-folk, folk, and Balkan music 24/7",
    },
  },
  gold: {
    id: "gold",
    urls: goldStreamUrls,
    nowPlayingUrl: null,
    names: {
      bg: "Gold Radio",
      en: "Gold Radio",
    },
    subtitles: {
      bg: "Музика, облечена в злато",
      en: "Music dressed in gold",
    },
  },
};

export const STATIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(stationDefinitions).filter(([stationId]) => showGoldStation || stationId !== "gold"),
  ),
);

export const content = {
  bg: {
    htmlLang: "bg",
    switchLanguage: "Превключи на английски",
    skipToContent: "Към съдържанието",
    navLabel: "Основна навигация",
    appearanceLabel: "Настройки на визията",
    themeLabel: "Тема",
    themeMenuOpen: "Отвори меню за тема",
    themeMenuClose: "Затвори меню за тема",
    paletteLabel: "Палитра",
    darkMode: "Тъмна",
    lightMode: "Светла",
    paletteHeritage: "Наздраве",
    paletteGold: "Злато",
    paletteOlive: "Олива",
    paletteContrast: "Контраст",
    highlightsLabel: "Акценти",
    navHome: "Начало",
    navExperience: "За нас",
    navFeatures: "История",
    navFollow: "Последвай",
    station: "Фолк Радио Наздраве",
    badge: "Поп-фолк, народна музика и балкански ритми нон-стоп",
    heroTitle: "Поп-фолк, фолклор и балкански ритми в едно живо онлайн.",
    heroText:
      "Фолк Радио Наздраве е интернет радио от София от 2005 година. Излъчва поп-фолк, българска народна и балканска музика денонощно — слушай на живо от всяко устройство.",
    heroPrimary: "Слушай на живо",
    heroSecondary: "Научи повече",
    cardLive: "Излъчване",
    cardStations: "Радиа",
    cardLanguages: "Езици",
    cardDevices: "Устройства",
    cardDevicesValue: "1 клик",
    cardAccessibility: "Достъпност",
    cardAccessibilityValue: "AA",
    selectStation: "Избери радио",
    liveNow: "В ефир сега",
    nowPlayingFallback: "Фолк Радио Наздраве на живо",
    nowPlayingEmpty: "Зареждаме информация за текущото парче...",
    playerDescription: "Натисни „Пусни“ и слушай радиото веднага.",
    play: "Пусни",
    pause: "Пауза",
    stop: "Стоп",
    mute: "Без звук",
    unmute: "Пусни звук",
    volume: "Сила на звука",
    downloadForExternalPlayer: "Слушай с външен плеър",
    backupStreamReady: "Gold Radio има резервен поток, ако основният източник прекъсне.",
    loading: "Плеърът зарежда.",
    playing: "Плеърът свири.",
    paused: "Плеърът е на пауза.",
    error: "Потокът не можа да бъде стартиран.",
    streamFallbackTitle: "Ако браузърът не може да пусне потока:",
    openInExternalPlayer: "Отвори в външен плеър (.m3u)",
    experienceTitle: "За нас",
    experienceText:
      "Фолк Радио Наздраве създава настроение за празник, срещи с приятели и силни музикални емоции. Подборът съчетава поп-фолк хитове, народна музика и балкански ритми за слушатели у нас и в чужбина.",
    experiencePoints: [
      "24-часова онлайн музикална програма",
      "Микс от поп-фолк, фолклор и балканско звучене",
      "Радио с празнична енергия за компания, път и добро настроение",
    ],
    featuresTitle: "Защо слушателите се връщат",
    features: [
      {
        title: "DJ Ico, Mitaka, Padre и Vanko",
        text: "Публично споменавани имена зад ефира на Наздраве — разпознаваем тон и празнична енергия.",
      },
      {
        title: "Разпознаваем музикален профил",
        text: "Програмата обединява поп-фолк хитове, български фолклор и балкански ритми в ясно разпознаваемо звучене.",
      },
      {
        title: "Постоянно онлайн присъствие",
        text: "Радиото е достъпно 24/7 и се слуша от телефон, таблет или компютър без сложни стъпки.",
      },
      {
        title: "За обекти и събития",
        text: "Подходящ музикален фон с български характер за заведения, празници и кампании.",
      },
    ],
    editorialTitle: "История",
    editorialBody:
      "Според публично достъпна информация Фолк Радио Наздраве започва в София като интернет радио около 2005 година. В ефира публично се свързват DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko — заедно с „ЗУРНА“ и „Нощна музикална линия“. Форматът е поп-фолк, народна музика и балкански ритми денонощно.",
    editorialList: [
      "DJ екип (публично споменавани): DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko",
      "Програми: „ЗУРНА“ и „Нощна музикална линия“",
      "Начало: София, интернет радио — 2005",
      "Формат: 24-часова програма — поп-фолк, фолклор, Балканите",
    ],
    testimonialsTitle: "Какво казват слушателите",
    testimonialsIntro:
      "Подготвени примерни клиентски отзиви, вдъхновени от стила и аудиторията на радиото.",
    testimonials: [
      {
        quote:
          "Фолк Радио Наздраве е радио, което веднага вдига настроението. Пускам го у дома, в колата и по време на събирания с приятели.",
        name: "Слушател от София",
        role: "Редовен онлайн слушател",
      },
      {
        quote:
          "Харесва ми, че програмата смесва поп-фолк, фолклор и балкански ритми по естествен начин. Звучи близко, живо и празнично.",
        name: "Слушателка от Пловдив",
        role: "Любител на българска и балканска музика",
      },
      {
        quote:
          "Новият сайт прави радиото още по-приятно за ползване. Плеърът е ясен, визията е силна, а слушането става с едно натискане.",
        name: "Слушател от чужбина",
        role: "Слуша радиото основно през мобилен телефон",
      },
    ],
    shortcutsTitle: "Клавишни команди",
    shortcuts: [
      "Интервал: пускане / пауза",
      "M: спиране / пускане на звука",
      "Стрелка нагоре: увеличаване на звука",
      "Стрелка надолу: намаляване на звука",
    ],
    socialTitle: "Последвай радиото",
    socialText:
      "Следи Folk Radio Nazdrave във Facebook, YouTube и TikTok за музика, видеа и новини около радиото.",
    facebook: "Facebook",
    youtube: "YouTube",
    tiktok: "TikTok",
    socialFacebookLabel: "Отвори Facebook страницата на радиото",
    socialYoutubeLabel: "Отвори YouTube канала на радиото",
    socialTiktokLabel: "Отвори TikTok профила на радиото",
    accessibilityWidget: "Уиджет за достъпност",
    accessibilityOpen: "Отвори уиджет за достъпност",
    accessibilityClose: "Затвори уиджет за достъпност",
    accessibilityPanelTitle: "Настройки за четимост",
    increaseTextSize: "Увеличи текста",
    decreaseTextSize: "Намали текста",
    enableHighContrast: "Включи висок контраст",
    disableHighContrast: "Изключи висок контраст",
    enableReducedMotion: "Включи ограничено движение",
    disableReducedMotion: "Изключи ограничено движение",
    contrastShort: "К+",
    contrastShortActive: "К++",
    motionShortOn: "Движение",
    motionShortOff: "Без движение",
    playerRoleDescription: "аудио плейър",
    stickyPlayerLabel: "Мини плейър",
    loadingLabel: "Зарежда се...",
    footer: "Подобрена уеб версия с фокус върху дизайн, достъпност и по-завършено дигитално изживяване.",
  },
  en: {
    htmlLang: "en",
    switchLanguage: "Switch to Bulgarian",
    skipToContent: "Skip to content",
    navLabel: "Primary navigation",
    appearanceLabel: "Appearance controls",
    themeLabel: "Theme",
    themeMenuOpen: "Open theme menu",
    themeMenuClose: "Close theme menu",
    paletteLabel: "Palette",
    darkMode: "Dark",
    lightMode: "Light",
    paletteHeritage: "Heritage",
    paletteGold: "Gold",
    paletteOlive: "Olive",
    paletteContrast: "Contrast",
    highlightsLabel: "Highlights",
    navHome: "Home",
    navExperience: "About us",
    navFeatures: "History",
    navFollow: "Follow",
    station: "Folk Radio Nazdrave",
    badge: "Pop-folk, folk music, and Balkan rhythms non-stop",
    heroTitle: "Pop-folk, folk, and Balkan rhythms in one live online radio.",
    heroText:
      "Folk Radio Nazdrave is an internet radio station from Sofia since 2005. It streams pop-folk, Bulgarian folk, and Balkan music around the clock — listen live on any device.",
    heroPrimary: "Listen live",
    heroSecondary: "Learn more",
    cardLive: "Live stream",
    cardStations: "Stations",
    cardLanguages: "Languages",
    cardDevices: "Devices",
    cardDevicesValue: "1 tap",
    cardAccessibility: "Accessibility",
    cardAccessibilityValue: "AA",
    selectStation: "Choose station",
    liveNow: "Now playing",
    nowPlayingFallback: "Folk Radio Nazdrave Live",
    nowPlayingEmpty: "Loading current track details...",
    playerDescription: "Press play and start listening right away.",
    play: "Play",
    pause: "Pause",
    stop: "Stop",
    mute: "Mute",
    unmute: "Unmute",
    volume: "Volume",
    downloadForExternalPlayer: "Listen with external player",
    backupStreamReady: "Gold Radio includes a backup stream if the primary source drops.",
    loading: "Player is loading.",
    playing: "Player is playing.",
    paused: "Player is paused.",
    error: "The stream could not be started.",
    streamFallbackTitle: "If the browser cannot play the stream:",
    openInExternalPlayer: "Open in external player (.m3u)",
    experienceTitle: "About us",
    experienceText:
      "Folk Radio Nazdrave is built around celebration, connection, and familiar musical energy. Its programming brings together pop-folk favorites, Bulgarian traditional music, and Balkan rhythms for listeners in Bulgaria and abroad.",
    experiencePoints: [
      "A 24-hour online music stream",
      "A mix of pop-folk, traditional folk, and Balkan sound",
      "A festive station identity suited to gatherings, travel, and everyday listening",
    ],
    featuresTitle: "Why listeners come back",
    features: [
      {
        title: "DJ Ico, Mitaka, Padre & Vanko",
        text: "Publicly mentioned names behind Nazdrave’s sound — a familiar tone and festive energy.",
      },
      {
        title: "A recognizable music profile",
        text: "The station blends pop-folk hits, Bulgarian folk, and Balkan rhythms into a sound that is easy to recognize.",
      },
      {
        title: "Always online",
        text: "The stream is available 24/7 and easy to start from phone, tablet, or desktop.",
      },
      {
        title: "For venues and events",
        text: "Bulgarian musical character for venues, celebrations, and campaigns.",
      },
    ],
    editorialTitle: "History",
    editorialBody:
      "Based on publicly available information, Folk Radio Nazdrave began in Sofia as an internet radio station around 2005. Public descriptions link DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko with the station — alongside ZURNA and Night Music Line. The format is pop-folk, folk music, and Balkan rhythms around the clock.",
    editorialList: [
      "DJ team (publicly mentioned): DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko",
      "Programs: ZURNA and Night Music Line",
      "Origin: Sofia internet radio — 2005",
      "Format: 24-hour pop-folk, folk, and Balkan programming",
    ],
    testimonialsTitle: "What listeners say",
    testimonialsIntro:
      "Client-ready sample testimonials prepared to match the tone and audience of the station.",
    testimonials: [
      {
        quote:
          "Folk Radio Nazdrave instantly lifts the mood. I play it at home, in the car, and during gatherings with friends.",
        name: "Listener from Sofia",
        role: "Regular online listener",
      },
      {
        quote:
          "I like how the station mixes pop-folk, traditional music, and Balkan rhythms in a natural way. It feels familiar, lively, and festive.",
        name: "Listener from Plovdiv",
        role: "Fan of Bulgarian and Balkan music",
      },
      {
        quote:
          "The new website makes the station even easier to enjoy. The player is clear, the visuals feel strong, and listening starts with one click.",
        name: "Listener abroad",
        role: "Mostly listens on mobile",
      },
    ],
    shortcutsTitle: "Keyboard shortcuts",
    shortcuts: [
      "Space: play / pause",
      "M: mute / unmute",
      "Arrow Up: raise volume",
      "Arrow Down: lower volume",
    ],
    socialTitle: "Follow the station",
    socialText:
      "Stay connected through the Folk Radio Nazdrave Facebook page, YouTube channel, and TikTok profile for music, videos, and station updates.",
    facebook: "Facebook",
    youtube: "YouTube",
    tiktok: "TikTok",
    socialFacebookLabel: "Open the station Facebook page",
    socialYoutubeLabel: "Open the station YouTube channel",
    socialTiktokLabel: "Open the station TikTok profile",
    accessibilityWidget: "Accessibility widget",
    accessibilityOpen: "Open accessibility widget",
    accessibilityClose: "Close accessibility widget",
    accessibilityPanelTitle: "Readability settings",
    increaseTextSize: "Increase text size",
    decreaseTextSize: "Decrease text size",
    enableHighContrast: "Enable high contrast",
    disableHighContrast: "Disable high contrast",
    enableReducedMotion: "Enable reduced motion",
    disableReducedMotion: "Disable reduced motion",
    contrastShort: "AA",
    contrastShortActive: "AA+",
    motionShortOn: "Motion",
    motionShortOff: "Still",
    playerRoleDescription: "audio player",
    stickyPlayerLabel: "Mini player",
    loadingLabel: "Loading...",
    footer: "An upgraded web version focused on design, accessibility, and a fuller digital experience.",
  },
};

export const localeCodes = Object.freeze(Object.keys(content));

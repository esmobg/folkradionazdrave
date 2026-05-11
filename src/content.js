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

  return (
    normalizedUrl === fallbackPath ||
    normalizedUrl.startsWith(`${fallbackPath}?`) ||
    normalizedUrl.endsWith(fallbackPath) ||
    normalizedUrl.includes(`${fallbackPath}?`)
  );
}

function createRetryableStreamUrls(configValue, fallbackPath, variantCount = 4) {
  const streamUrl = getBrowserSafeStreamUrl(configValue, fallbackPath);

  if (!isProxyBackedStreamUrl(streamUrl, fallbackPath)) {
    return [streamUrl];
  }

  return Array.from(
    new Set(
      Array.from({ length: variantCount }, (_value, index) => appendQueryParam(streamUrl, "client", index)),
    ),
  );
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
      "Фолк Радио Наздраве е интернет радио от София, създадено през 2005 година от трима приятели, тогава студенти. Станцията излъчва поп-фолк, българска народна и балканска музика денонощно, а тази нова уеб версия прави слушането по-лесно, по-ясно и по-достъпно на всяко устройство.",
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
      "Фолк Радио Наздраве създава настроение за празник, срещи с приятели и силни музикални емоции. Подборът съчетава поп-фолк хитове, народна музика и балкански ритми в програма, която звучи близо до вкуса на слушателите у нас и в чужбина.",
    experiencePoints: [
      "24-часова онлайн музикална програма",
      "Микс от поп-фолк, фолклор и балканско звучене",
      "Радио с празнична енергия за компания, път и добро настроение",
    ],
    featuresTitle: "Защо слушателите се връщат",
    features: [
      {
        title: "Разпознаваем музикален профил",
        text: "Програмата обединява познати поп-фолк хитове, български фолклор и балкански ритми в едно ясно разпознаваемо звучене.",
      },
      {
        title: "Постоянно онлайн присъствие",
        text: "Радиото е достъпно 24/7 и може да бъде слушано от различни устройства без сложни стъпки.",
      },
      {
        title: "Близо до публиката",
        text: "Тонът на станцията е директен, празничен и създаден за хора, които обичат музика с характер и настроение.",
      },
      {
        title: "По-силно дигитално представяне",
        text: "Новият сайт представя радиото по-ясно, по-стилно и по-достъпно за слушатели, клиенти и партньори.",
      },
    ],
    editorialTitle: "История",
    editorialBody:
      "Според публично достъпна информация Фолк Радио Наздраве започва през 2005 година в София като интернет радио, създадено от трима приятели, тогава студенти. Идеята е проста и силна: едно място за поп-фолк, народна музика и балкански ритми, което да носи настроение по всяко време.",
    editorialList: [
      "Начало: София, 2005 г.",
      "Формат: интернет радио с 24-часова програма",
      "Публично споменавани програми: „Нощна музикална линия“ и зоната за поздрави „ЗУРНА“",
      "Публично споменавани DJ имена: DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko",
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
      "Folk Radio Nazdrave is an internet radio station from Sofia, publicly described as starting in 2005 by three friends who were students at the time. The station streams pop-folk, Bulgarian folk, and Balkan music around the clock, while this updated web app makes listening clearer, faster, and more accessible across devices.",
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
      "Folk Radio Nazdrave is built around celebration, connection, and familiar musical energy. Its programming brings together pop-folk favorites, Bulgarian traditional music, and broader Balkan rhythms in a stream that feels festive, warm, and recognizably local.",
    experiencePoints: [
      "A 24-hour online music stream",
      "A mix of pop-folk, traditional folk, and Balkan sound",
      "A festive station identity suited to gatherings, travel, and everyday listening",
    ],
    featuresTitle: "Why listeners come back",
    features: [
      {
        title: "A recognizable music profile",
        text: "The station blends pop-folk hits, Bulgarian folk, and Balkan rhythms into a sound that is easy to recognize and remember.",
      },
      {
        title: "Always online",
        text: "The stream is available 24/7 and is designed to be easy to access from different devices.",
      },
      {
        title: "Close to its audience",
        text: "The tone of the station is direct, festive, and tailored to listeners who want music with character and energy.",
      },
      {
        title: "A stronger digital presence",
        text: "The updated site presents the station in a clearer, more polished, and more accessible way for listeners, clients, and partners.",
      },
    ],
    editorialTitle: "History",
    editorialBody:
      "Based on public directory listings, Folk Radio Nazdrave began in Sofia in 2005 as an internet radio station created by three friends who were students at the time. The idea was simple and memorable: create one place for pop-folk, traditional Bulgarian music, and Balkan rhythms that keeps the mood alive all day long.",
    editorialList: [
      "Origin: Sofia, 2005",
      "Format: internet radio with 24-hour programming",
      "Publicly listed programs include Night Music Line and the request zone called ZURNA",
      "Publicly listed DJs include DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko",
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
    playerRoleDescription: "audio player",
    stickyPlayerLabel: "Mini player",
    loadingLabel: "Loading...",
    footer: "An upgraded web version focused on design, accessibility, and a fuller digital experience.",
  },
};

export const localeCodes = Object.freeze(Object.keys(content));

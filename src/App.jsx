import { useEffect, useRef, useState } from "react";
import { STATIONS, content } from "./content";

const DEFAULT_STATION_ID = STATIONS.nazdrave ? "nazdrave" : Object.keys(STATIONS)[0];
const PLAYBACK_START_TIMEOUT_MS = 6500;
const BUFFERING_RECOVERY_TIMEOUT_MS = 7000;
const BUFFERING_INDICATOR_DELAY_MS = 450;
const SAME_STREAM_RETRY_DELAY_MS = 500;
const NEXT_STREAM_RETRY_DELAY_MS = 150;
const MAX_STREAM_RETRY_ATTEMPTS = 5;

function getValidStationId(stationId) {
  return STATIONS[stationId] ? stationId : DEFAULT_STATION_ID;
}

function generateWavePath(amplitude, frequency, yOffset) {
  const width = 400;
  const points = [];

  for (let x = 0; x <= width; x += 4) {
    const y = yOffset + Math.sin((x / width) * Math.PI * frequency) * amplitude;
    points.push(`${x},${y.toFixed(1)}`);
  }

  return `M${points.join(" L")}`;
}

const WAVE_PATHS = {
  paused: [
    generateWavePath(3, 4, 40),
    generateWavePath(2, 6, 40),
    generateWavePath(1.5, 8, 40),
  ],
  playing: [
    generateWavePath(18, 4, 40),
    generateWavePath(14, 6, 40),
    generateWavePath(10, 8, 40),
  ],
};

function Waveform({ isPlaying }) {
  const [pathOne, pathTwo, pathThree] = isPlaying ? WAVE_PATHS.playing : WAVE_PATHS.paused;

  return (
    <svg
      className="waveform-svg"
      viewBox="0 0 400 80"
      preserveAspectRatio="none"
      aria-hidden="true"
      role="presentation"
    >
      <path className="wave-path wave-path-1" d={pathOne} />
      <path className="wave-path wave-path-2" d={pathTwo} />
      <path className="wave-path wave-path-3" d={pathThree} />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14 8h3V4h-3c-3.1 0-5 1.9-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.7.3-1 1-1Z" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M22 9.4c0-2-1.6-3.6-3.5-3.7C16.4 5.5 13.9 5.4 12 5.4c-1.9 0-4.4.1-6.5.3C3.6 5.8 2 7.4 2 9.4c-.1 1.2-.1 2.3-.1 2.6s0 1.4.1 2.6c0 2 1.6 3.6 3.5 3.7 2.1.2 4.6.3 6.5.3 1.9 0 4.4-.1 6.5-.3 1.9-.1 3.5-1.7 3.5-3.7.1-1.2.1-2.3.1-2.6s0-1.4-.1-2.6ZM10 15.5v-7l6 3.5-6 3.5Z" />
    </svg>
  );
}

function TiktokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14 3h3.1c.2 1.5 1.1 2.8 2.5 3.5.8.4 1.6.6 2.4.6v3.1c-1.6 0-3.2-.4-4.5-1.1v5.5c0 3-2.5 5.4-5.5 5.4s-5.5-2.4-5.5-5.4 2.5-5.4 5.5-5.4c.3 0 .7 0 1 .1v3.2a2.5 2.5 0 1 0 1 2.1V3Z" />
    </svg>
  );
}

function getNextOptionId(optionIds, currentId, key) {
  const currentIndex = optionIds.indexOf(currentId);

  if (currentIndex === -1) {
    return null;
  }

  if (key === "Home") {
    return optionIds[0];
  }

  if (key === "End") {
    return optionIds[optionIds.length - 1];
  }

  if (key === "ArrowRight" || key === "ArrowDown") {
    return optionIds[(currentIndex + 1) % optionIds.length];
  }

  if (key === "ArrowLeft" || key === "ArrowUp") {
    return optionIds[(currentIndex - 1 + optionIds.length) % optionIds.length];
  }

  return null;
}

function handleRadioKeyDown(event, optionIds, currentId, selectOption, refsMap) {
  const nextId = getNextOptionId(optionIds, currentId, event.key);

  if (nextId) {
    event.preventDefault();
    selectOption(nextId);
    window.requestAnimationFrame(() => {
      refsMap.current[nextId]?.focus();
    });
    return;
  }

  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    selectOption(currentId);
  }
}

function setOptionRef(refMap, id) {
  return (node) => {
    if (node) {
      refMap.current[id] = node;
      return;
    }

    delete refMap.current[id];
  };
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem("radio-language") || "bg");
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("radio-theme-mode") || "dark");
  const [selectedStationId, setSelectedStationId] = useState(
    () => getValidStationId(localStorage.getItem("radio-station") || DEFAULT_STATION_ID),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPlaybackAttempted, setHasPlaybackAttempted] = useState(false);
  const [volume, setVolume] = useState(70);
  const [track, setTrack] = useState(null);
  const [error, setError] = useState("");
  const [showStickyPlayer, setShowStickyPlayer] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem("radio-font-scale") || "1"));
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem("radio-high-contrast") === "true");
  const [reducedMotionMode, setReducedMotionMode] = useState(
    () => localStorage.getItem("radio-reduced-motion") === "true",
  );

  const audioRef = useRef(null);
  const hasPlaybackAttemptedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const selectedStationRef = useRef(selectedStationId);
  const streamIndexRef = useRef(0);
  const retryTimerRef = useRef(null);
  const playbackStartTimerRef = useRef(null);
  const bufferingIndicatorTimerRef = useRef(null);
  const playbackAttemptRef = useRef(0);
  const retryAttemptCountRef = useRef(0);
  const playerRef = useRef(null);
  const stickyPlayerRef = useRef(null);
  const playButtonRef = useRef(null);
  const accessibilityTriggerRef = useRef(null);
  const themeMenuRef = useRef(null);
  const themeTriggerRef = useRef(null);
  const themeButtonRefs = useRef({});
  const stationButtonRefs = useRef({});

  const t = content[language];
  const themeOptions = [
    { id: "dark", label: t.darkMode },
    { id: "light", label: t.lightMode },
  ];
  const stationsList = Object.values(STATIONS);
  const themeIds = themeOptions.map((option) => option.id);
  const stationIds = stationsList.map((station) => station.id);
  const selectedStation = STATIONS[selectedStationId] ?? STATIONS[DEFAULT_STATION_ID];
  const stationPlaylistUrl = selectedStationId === "gold" ? "/gold.m3u" : "/nazdrave.m3u";
  const stationName = selectedStation.names[language];
  const stationSubtitle = selectedStation.subtitles[language];

  function selectStation(nextStationId) {
    if (!STATIONS[nextStationId] || nextStationId === selectedStationRef.current) {
      return;
    }

    clearRetryTimer();
    clearPlaybackStartTimer();
    clearBufferingIndicatorTimer();
    setTrack(null);
    setError("");
    retryAttemptCountRef.current = 0;

    if (hasPlaybackAttemptedRef.current && (isPlayingRef.current || isLoadingRef.current)) {
      setIsPlaying(false);
      setIsLoading(true);
    }

    setSelectedStationId(nextStationId);
  }

  useEffect(() => {
    localStorage.setItem("radio-language", language);
    localStorage.setItem("radio-theme-mode", themeMode);
    localStorage.setItem("radio-station", selectedStationId);
    localStorage.setItem("radio-font-scale", String(fontScale));
    localStorage.setItem("radio-high-contrast", String(highContrast));
    localStorage.setItem("radio-reduced-motion", String(reducedMotionMode));
    document.documentElement.lang = t.htmlLang;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    document.title =
      selectedStationId === "nazdrave"
        ? language === "bg"
          ? "Фолк Радио Наздраве — поп-фолк и народна музика онлайн"
          : "Folk Radio Nazdrave — Bulgarian Pop-Folk Online"
        : `${stationName} | ${t.station}`;
  }, [
    fontScale,
    highContrast,
    language,
    reducedMotionMode,
    selectedStationId,
    stationName,
    t.htmlLang,
    t.station,
    themeMode,
  ]);

  useEffect(() => {
    if (STATIONS[selectedStationId]) {
      return;
    }

    setSelectedStationId(DEFAULT_STATION_ID);
  }, [selectedStationId]);

  useEffect(() => {
    selectedStationRef.current = selectedStationId;
  }, [selectedStationId]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    isLoadingRef.current = isLoading;
  }, [isLoading, isPlaying]);

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "none";
    audio.volume = volume / 100;
    audioRef.current = audio;

    return () => {
      if (playbackStartTimerRef.current) {
        window.clearTimeout(playbackStartTimerRef.current);
      }
      if (bufferingIndicatorTimerRef.current) {
        window.clearTimeout(bufferingIndicatorTimerRef.current);
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return undefined;
    }

    const onPlaying = () => {
      retryAttemptCountRef.current = 0;
      clearBufferingIndicatorTimer();
      clearRetryTimer();
      clearPlaybackStartTimer();
      setIsLoading(false);
      setIsPlaying(true);
      setError("");
    };

    const onWaiting = () => {
      if (!playbackStartTimerRef.current && !bufferingIndicatorTimerRef.current) {
        bufferingIndicatorTimerRef.current = window.setTimeout(() => {
          setIsLoading(true);
        }, BUFFERING_INDICATOR_DELAY_MS);
      }

      if (!hasPlaybackAttemptedRef.current || playbackStartTimerRef.current) {
        return;
      }

      playbackStartTimerRef.current = window.setTimeout(() => {
        audio.pause();
        clearRetryTimer();
        scheduleRetry(selectedStationRef.current, streamIndexRef.current);
      }, BUFFERING_RECOVERY_TIMEOUT_MS);
    };
    const onPause = () => {
      clearBufferingIndicatorTimer();
      clearPlaybackStartTimer();
      setIsLoading(false);
      setIsPlaying(false);
    };
    const onError = () => {
      if (!hasPlaybackAttemptedRef.current) {
        return;
      }

      clearBufferingIndicatorTimer();
      clearRetryTimer();
      clearPlaybackStartTimer();
      scheduleRetry(selectedStationRef.current, streamIndexRef.current);
    };
    const onEnded = () => {
      if (!hasPlaybackAttemptedRef.current) {
        return;
      }

      clearBufferingIndicatorTimer();
      clearRetryTimer();
      clearPlaybackStartTimer();
      scheduleRetry(selectedStationRef.current, streamIndexRef.current);
    };
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.volume = isMuted ? 0 : volume / 100;
  }, [isMuted, volume]);

  useEffect(() => {
    const nowPlayingUrl = selectedStation.nowPlayingUrl;
    let ignore = false;
    let timerId = null;
    let controller = null;

    if (!nowPlayingUrl) {
      setTrack(null);
      return undefined;
    }

    async function loadTrack() {
      if (document.visibilityState === "hidden") {
        timerId = window.setTimeout(loadTrack, 15000);
        return;
      }

      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch(nowPlayingUrl, { signal: controller.signal });
        const data = await response.json();

        if (!ignore) {
          setTrack(data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (!ignore) {
          setTrack(null);
        }
      } finally {
        if (!ignore) {
          timerId = window.setTimeout(loadTrack, 15000);
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        controller?.abort();
        return;
      }

      if (timerId) {
        window.clearTimeout(timerId);
        timerId = null;
      }

      void loadTrack();
    }

    void loadTrack();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      ignore = true;
      controller?.abort();
      if (timerId) {
        window.clearTimeout(timerId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selectedStation]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const shouldResume = hasPlaybackAttemptedRef.current && (isPlaying || isLoading);

    clearRetryTimer();
    clearPlaybackStartTimer();
    clearBufferingIndicatorTimer();
    setTrack(null);
    setError("");
    retryAttemptCountRef.current = 0;
    setIsPlaying(false);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    streamIndexRef.current = 0;

    if (shouldResume) {
      setIsLoading(true);
      void attemptPlayback(selectedStationId, 0);
      return;
    }

    setIsLoading(false);
  }, [selectedStationId]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const active = document.activeElement;
      const tag = active?.tagName;
      const inPlayerRegion = Boolean(
        active?.closest("#player") || active?.closest(".sticky-player"),
      );
      const isVolumeSlider =
        tag === "INPUT" && active?.getAttribute("type") === "range" && inPlayerRegion;
      const inFormField =
        (tag === "INPUT" && !isVolumeSlider) || tag === "TEXTAREA" || tag === "SELECT";
      const inRadioGroup = active?.closest("[role='radiogroup']");
      const inInteractiveControl =
        tag === "BUTTON"
        || tag === "A"
        || active?.getAttribute("role") === "button"
        || active?.isContentEditable;

      if (event.code === "ArrowUp" || event.code === "ArrowDown") {
        if (!inPlayerRegion) {
          return;
        }

        event.preventDefault();
        setVolume((current) =>
          event.code === "ArrowUp"
            ? Math.min(100, current + 10)
            : Math.max(0, current - 10),
        );
        return;
      }

      if (inFormField || inRadioGroup || inInteractiveControl) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
        return;
      }

      if (event.code === "KeyM") {
        event.preventDefault();
        setIsMuted((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (showStickyPlayer) {
      return undefined;
    }

    const stickyEl = stickyPlayerRef.current;
    const active = document.activeElement;

    if (stickyEl && active && stickyEl.contains(active)) {
      playButtonRef.current?.focus();
    }

    return undefined;
  }, [showStickyPlayer]);

  useEffect(() => {
    if (!accessibilityOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.code !== "Escape") {
        return;
      }

      event.preventDefault();
      setAccessibilityOpen(false);
      accessibilityTriggerRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [accessibilityOpen]);

  useEffect(() => {
    if (!themeMenuOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.code !== "Escape") {
        return;
      }

      event.preventDefault();
      setThemeMenuOpen(false);
      themeTriggerRef.current?.focus();
    };

    const onPointerDown = (event) => {
      const menuEl = themeMenuRef.current;

      if (menuEl && !menuEl.contains(event.target)) {
        setThemeMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    const playerEl = playerRef.current;

    if (!playerEl) {
      return undefined;
    }

    const updateStickyVisibility = () => {
      if (!hasPlaybackAttemptedRef.current) {
        setShowStickyPlayer(false);
        return;
      }

      const rect = playerEl.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      const ratio = rect.height > 0 ? Math.max(0, visibleHeight) / rect.height : 0;
      const scrolledPastPlayer = rect.bottom < window.innerHeight * 0.5 || window.scrollY > 240;
      setShowStickyPlayer(ratio < 0.45 || scrolledPastPlayer);
    };

    const observer = new IntersectionObserver(() => {
      updateStickyVisibility();
    }, { threshold: [0, 0.15, 0.35, 0.55, 0.75, 1] });

    observer.observe(playerEl);
    window.addEventListener("scroll", updateStickyVisibility, { passive: true });
    window.addEventListener("resize", updateStickyVisibility);
    updateStickyVisibility();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateStickyVisibility);
      window.removeEventListener("resize", updateStickyVisibility);
    };
  }, [hasPlaybackAttempted]);

  function clearRetryTimer() {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function clearPlaybackStartTimer() {
    if (playbackStartTimerRef.current) {
      window.clearTimeout(playbackStartTimerRef.current);
      playbackStartTimerRef.current = null;
    }
  }

  function clearBufferingIndicatorTimer() {
    if (bufferingIndicatorTimerRef.current) {
      window.clearTimeout(bufferingIndicatorTimerRef.current);
      bufferingIndicatorTimerRef.current = null;
    }
  }

  function getRetryStreamIndex(stationId, streamIndex) {
    const station = STATIONS[stationId];

    if (!station) {
      return streamIndex;
    }

    return station.urls[streamIndex + 1] ? streamIndex + 1 : streamIndex;
  }

  function scheduleRetry(stationId, streamIndex) {
    retryAttemptCountRef.current += 1;

    if (retryAttemptCountRef.current > MAX_STREAM_RETRY_ATTEMPTS) {
      clearRetryTimer();
      clearPlaybackStartTimer();
      clearBufferingIndicatorTimer();
      setIsLoading(false);
      setIsPlaying(false);
      setError(t.error);
      return;
    }

    const nextStreamIndex = getRetryStreamIndex(stationId, streamIndex);
    const retryDelay = nextStreamIndex === streamIndex ? SAME_STREAM_RETRY_DELAY_MS : NEXT_STREAM_RETRY_DELAY_MS;

    retryTimerRef.current = window.setTimeout(() => {
      void attemptPlayback(stationId, nextStreamIndex);
    }, retryDelay);
  }

  async function attemptPlayback(stationId, streamIndex = 0) {
    const audio = audioRef.current;
    const station = STATIONS[stationId];

    if (!audio || !station) {
      return;
    }

    setHasPlaybackAttempted(true);
    hasPlaybackAttemptedRef.current = true;
    const streamUrl = station.urls[streamIndex];

    if (!streamUrl) {
      clearRetryTimer();
      setIsLoading(false);
      setIsPlaying(false);
      setError(t.error);
      return;
    }

    selectedStationRef.current = stationId;
    playbackAttemptRef.current += 1;
    const playbackAttemptId = playbackAttemptRef.current;
    streamIndexRef.current = streamIndex;
    clearRetryTimer();
    clearPlaybackStartTimer();
    clearBufferingIndicatorTimer();
    setError("");
    retryAttemptCountRef.current = 0;
    setIsLoading(true);

    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.src = streamUrl;
      audio.load();
      playbackStartTimerRef.current = window.setTimeout(() => {
        if (playbackAttemptRef.current !== playbackAttemptId || isPlayingRef.current) {
          return;
        }

        audio.pause();
        scheduleRetry(stationId, streamIndex);
      }, PLAYBACK_START_TIMEOUT_MS);
      await audio.play();
    } catch {
      clearRetryTimer();
      clearPlaybackStartTimer();
      setIsPlaying(false);
      setIsLoading(true);
      scheduleRetry(stationId, streamIndex);
    }
  }

  async function togglePlayback() {
    if (!audioRef.current) {
      return;
    }

    if (isPlayingRef.current || isLoadingRef.current) {
      clearRetryTimer();
      clearPlaybackStartTimer();
      clearBufferingIndicatorTimer();
      audioRef.current.pause();
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    await attemptPlayback(selectedStationRef.current, 0);
  }

  const statusMessage = error
    ? hasPlaybackAttempted
      ? error
      : t.paused
    : isLoading
      ? t.loading
      : isPlaying
        ? t.playing
        : t.paused;

  const statusToneClass = error
    ? "status-error"
    : isLoading
      ? "status-loading"
      : isPlaying
        ? "status-live"
        : "status-paused";

  const liveTitle = selectedStation.nowPlayingUrl
    ? track?.title || t.nowPlayingFallback
    : stationName;
  const liveArtist = selectedStation.nowPlayingUrl
    ? track?.artist || t.nowPlayingEmpty
    : stationSubtitle;

  const shellClasses = [
    "page-shell",
    `mode-${themeMode}`,
    highContrast ? "a11y-high-contrast" : "",
    reducedMotionMode ? "a11y-reduced-motion" : "",
    showStickyPlayer ? "has-sticky-player" : "",
  ].filter(Boolean).join(" ");

  const playerCardClasses = [
    "hero-player",
    selectedStationId === "gold" ? "station-gold" : "station-nazdrave",
    isPlaying ? "is-playing" : "",
  ].filter(Boolean).join(" ");

  const pageCopy = language === "bg"
    ? {
        heroHeadline: "Поп-фолк, народна музика и балкански ритми — на живо.",
        heroText: "Пусни Фолк Радио Наздраве с едно натискане и остани с настроението на българското интернет радио.",
        playerNote: "Избери станция и пусни. Space / M извън полета; сила със стрелки във плейъра.",
        aboutHeading: "За радиото",
        aboutText:
          "Интернет радио от София от 2005 г. — поп-фолк, български фолклор и балкански ритми денонощно. Публично споменавани DJ имена на станцията: DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko.",
        aboutPoints: [
          "Разпознаваем микс от поп-фолк, народна музика и балканско звучене",
          "DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko — публично свързани с ефира на Наздраве",
          "Жив поток за всеки ден, път и празнични моменти",
        ],
        historyHeading: "История и DJ екип",
        historyText:
          "Фолк Радио Наздраве е интернет радио от София с начало около 2005 г. В публичните описания на програмата се открояват DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko — заедно с зоната за поздрави „ЗУРНА“ и „Нощна музикална линия“. Форматът е 24/7: поп-фолк, български фолклор и балкански ритми.",
        historyPoints: [
          "DJ Ico · DJ Mitaka · DJ Padre · DJ Vanko",
          "Публично споменавани: „ЗУРНА“ и „Нощна музикална линия“",
          "София, интернет радио — 2005 · 24/7",
        ],
        featuresHeading: "Какво чуваш тук",
        featuresIntro: "Ясен музикален профил, познати DJ имена и второ радио на сайта — Gold Radio.",
        featureItems: [
          {
            title: "DJ Ico, Mitaka, Padre и Vanko",
            text: "Публично споменавани имена зад ефира на Наздраве — разпознаваем тон и празнична енергия.",
          },
          {
            title: "Ясен музикален профил",
            text: "Поп-фолк, фолклор и балкански ритми — знаеш какво чуваш от първите секунди.",
          },
          {
            title: "Две радиа на едно място",
            text: "Наздраве за празничния фолк тон; Gold Radio — вторият поток на сайта.",
          },
        ],
        socialHeading: "Следвай радиото",
        socialText: "Facebook, YouTube и TikTok — музика, видеа и новини от Фолк Радио Наздраве и DJ екипа.",
        footer: "Фолк Радио Наздраве — интернет радио от София. DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko. Слушай на живо.",
        footerCreditLabel: "Сайтът е изработен от",
      }
    : {
        heroHeadline: "Pop-folk, folk music, and Balkan rhythms — live.",
        heroText: "Press play on Folk Radio Nazdrave and stay with the mood of Bulgarian internet radio.",
        playerNote: "Pick a station and press play. Space / M outside fields; volume arrows inside the player.",
        aboutHeading: "About the station",
        aboutText:
          "Internet radio from Sofia since 2005 — pop-folk, Bulgarian folk, and Balkan rhythms around the clock. Publicly mentioned station DJs: DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko.",
        aboutPoints: [
          "A recognizable mix of pop-folk, folk, and Balkan sound",
          "DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko — publicly linked with Nazdrave’s on-air presence",
          "A live stream for everyday listening, travel, and celebrations",
        ],
        historyHeading: "History and DJ team",
        historyText:
          "Folk Radio Nazdrave is an internet-only radio station from Sofia, with beginnings often dated to 2005. Public descriptions highlight DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko — alongside the ZURNA request zone and Night Music Line. The format runs 24/7: pop-folk, Bulgarian folk, and Balkan rhythms.",
        historyPoints: [
          "DJ Ico · DJ Mitaka · DJ Padre · DJ Vanko",
          "Publicly mentioned: ZURNA and Night Music Line",
          "Sofia internet radio — 2005 · 24/7",
        ],
        featuresHeading: "What you’ll hear here",
        featuresIntro: "A clear music profile, recognizable DJ names, and a second station on the site — Gold Radio.",
        featureItems: [
          {
            title: "DJ Ico, Mitaka, Padre & Vanko",
            text: "Publicly mentioned names behind Nazdrave’s sound — a familiar tone and festive energy.",
          },
          {
            title: "A clear music profile",
            text: "Pop-folk, folk, and Balkan rhythms — you know the sound from the first seconds.",
          },
          {
            title: "Two stations in one place",
            text: "Nazdrave for the festive folk mood; Gold Radio as the site’s second stream.",
          },
        ],
        socialHeading: "Follow the station",
        socialText: "Facebook, YouTube, and TikTok — music, videos, and updates from Folk Radio Nazdrave and the DJ team.",
        footer: "Folk Radio Nazdrave — internet radio from Sofia. DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko. Listen live.",
        footerCreditLabel: "Website by",
      };

  return (
    <div className={shellClasses} style={{ "--user-font-scale": fontScale }}>
      <a className="skip-link" href="#main-content">
        {t.skipToContent}
      </a>
      <div className="noise-layer" aria-hidden="true" />
      <div className="grid-veil" aria-hidden="true" />
      <div className="glow glow-one" aria-hidden="true" />
      <div className="glow glow-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand brand-compact" href="#main-content" aria-label={t.station}>
          <img
            src="/logo-client.svg"
            alt=""
            className="brand-logo"
            aria-hidden="true"
            width="48"
            height="48"
          />
          <strong className="brand-name">{t.station}</strong>
        </a>

        <nav className="top-nav" aria-label={t.navLabel}>
          <div className="top-nav-links">
            <a href="#main-content">{t.navHome}</a>
            <a href="#about">{t.navExperience}</a>
            <a href="#history">{t.navFeatures}</a>
            <a href="#follow">{t.navFollow}</a>
          </div>

          <div
            className={`theme-menu ${themeMenuOpen ? "is-open" : ""}`}
            ref={themeMenuRef}
          >
            <button
              type="button"
              className="theme-menu-trigger"
              ref={themeTriggerRef}
              aria-label={themeMenuOpen ? t.themeMenuClose : t.themeMenuOpen}
              aria-expanded={themeMenuOpen}
              aria-controls="theme-menu-panel"
              onClick={() => setThemeMenuOpen((current) => !current)}
            >
              {t.themeLabel}
            </button>
            <div
              className="theme-menu-panel"
              id="theme-menu-panel"
              role="region"
              aria-label={t.themeLabel}
              hidden={!themeMenuOpen}
            >
              <div
                className="theme-menu-options"
                role="radiogroup"
                aria-labelledby="theme-label"
              >
                <span className="sr-only" id="theme-label">{t.themeLabel}</span>
                {themeOptions.map((option) => {
                  const isActive = option.id === themeMode;

                  return (
                    <button
                      key={option.id}
                      ref={setOptionRef(themeButtonRefs, option.id)}
                      type="button"
                      className={isActive ? "segment-button active" : "segment-button"}
                      onClick={() => {
                        setThemeMode(option.id);
                        setThemeMenuOpen(false);
                        themeTriggerRef.current?.focus();
                      }}
                      onKeyDown={(event) =>
                        handleRadioKeyDown(event, themeIds, option.id, setThemeMode, themeButtonRefs)}
                      role="radio"
                      aria-checked={isActive}
                      tabIndex={isActive ? 0 : -1}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="language-toggle"
            onClick={() => setLanguage((current) => (current === "bg" ? "en" : "bg"))}
            aria-label={t.switchLanguage}
          >
            <img
              className="lang-icon"
              src={language === "bg" ? "/lang-en.svg" : "/lang-bg.svg"}
              alt=""
              aria-hidden="true"
              width="18"
              height="18"
            />
            <span className="lang-text">{language === "bg" ? "EN" : "BG"}</span>
          </button>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="hero-stage" aria-label={t.station}>
          <div className="hero-atmosphere" aria-hidden="true">
            <img className="hero-atmosphere-image" src="/hero-stage.svg" alt="" />
            <div className="hero-atmosphere-wash" />
          </div>

          <div className="hero-inner">
            <div className="hero-brand-block">
              <img
                src="/logo-client.svg"
                alt=""
                className="hero-brand-logo"
                aria-hidden="true"
                width="120"
                height="120"
              />
              <h1 className="hero-brand-name">{t.station}</h1>
              <p className="hero-headline">{pageCopy.heroHeadline}</p>
              <p className="hero-support">{pageCopy.heroText}</p>
              <div className="hero-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    document.getElementById("player")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    void togglePlayback();
                  }}
                >
                  {t.heroPrimary}
                </button>
                <a className="button button-secondary" href="#about">
                  {t.heroSecondary}
                </a>
              </div>
            </div>

            <section
              className={playerCardClasses}
              id="player"
              ref={playerRef}
              role="region"
              aria-roledescription={t.playerRoleDescription}
              aria-labelledby="player-title"
              aria-busy={isLoading}
            >
              <div className="player-heading-row">
                <div>
                  <h2 id="player-title">{liveTitle}</h2>
                  <p className="player-subtitle">{liveArtist}</p>
                </div>
              </div>

              <p className="player-note" id="player-note">{pageCopy.playerNote}</p>

              <div className="station-picker" role="radiogroup" aria-label={t.selectStation}>
                {stationsList.map((station) => {
                  const isActive = station.id === selectedStationId;
                  const artClass = station.id === "gold"
                    ? "station-art station-art-gold"
                    : "station-art station-art-nazdrave";

                  return (
                    <button
                      key={station.id}
                      ref={setOptionRef(stationButtonRefs, station.id)}
                      type="button"
                      className={isActive ? "station-button active" : "station-button"}
                      onClick={() => selectStation(station.id)}
                      onKeyDown={(event) =>
                        handleRadioKeyDown(
                          event,
                          stationIds,
                          station.id,
                          selectStation,
                          stationButtonRefs,
                        )}
                      role="radio"
                      aria-checked={isActive}
                      tabIndex={isActive ? 0 : -1}
                    >
                      <span className={artClass} aria-hidden="true">
                        <img
                          className="station-art-icon"
                          src={station.id === "gold" ? "/station-gold.svg" : "/station-nazdrave.svg"}
                          alt=""
                          aria-hidden="true"
                          width="22"
                          height="22"
                        />
                      </span>
                      <span className="station-button-content">
                        <span>{station.names[language]}</span>
                        <small>{station.subtitles[language]}</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedStationId === "gold" ? (
                <p className="station-note">{t.backupStreamReady}</p>
              ) : null}

              <div className={`visualizer ${isPlaying ? "is-playing" : ""}`} aria-hidden="true">
                <Waveform isPlaying={isPlaying} />
              </div>

              <div className="controls">
                <button
                  type="button"
                  className="play-button"
                  ref={playButtonRef}
                  onClick={() => void togglePlayback()}
                  aria-pressed={isPlaying}
                  aria-label={isLoading ? t.stop : isPlaying ? t.pause : t.play}
                  aria-describedby="player-note player-status"
                  aria-keyshortcuts="Space"
                >
                  {isLoading ? t.stop : isPlaying ? t.pause : t.play}
                </button>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setIsMuted((current) => !current)}
                  aria-pressed={isMuted}
                  aria-label={isMuted ? t.unmute : t.mute}
                  aria-describedby="player-status"
                  aria-keyshortcuts="M"
                >
                  {isMuted ? t.unmute : t.mute}
                </button>
                <a
                  className="button button-secondary external-download-button"
                  href="/folk-radio-playlist.m3u"
                  download
                  aria-label={t.downloadForExternalPlayer}
                >
                  {t.downloadForExternalPlayer}
                </a>
              </div>

              <label className="slider-wrap">
                <span>{t.volume}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  aria-label={`${t.volume}: ${volume}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={volume}
                />
                <strong>{volume}%</strong>
              </label>

              <p
                className={`status-line ${statusToneClass}`}
                id="player-status"
                role="status"
                aria-live={error ? "assertive" : "polite"}
                aria-atomic="true"
              >
                {statusMessage}
              </p>
              {error ? (
                <div className="stream-fallback">
                  <p>{t.streamFallbackTitle}</p>
                  <a
                    className="button button-secondary"
                    href={stationPlaylistUrl}
                    download
                    aria-label={t.openInExternalPlayer}
                  >
                    {t.openInExternalPlayer}
                  </a>
                </div>
              ) : null}
            </section>
          </div>
        </section>

        <div className="content-stack">
          <section className="content-section" id="about" aria-labelledby="about-title">
            <h2 id="about-title">{pageCopy.aboutHeading}</h2>
            <p className="lead-copy">{pageCopy.aboutText}</p>
            <ul className="point-list">
              {pageCopy.aboutPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="content-section" id="history" aria-labelledby="history-title">
            <h2 id="history-title">{pageCopy.historyHeading}</h2>
            <p className="lead-copy">{pageCopy.historyText}</p>
            <ul className="point-list compact-list">
              {pageCopy.historyPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="content-section feature-section" id="features" aria-labelledby="features-title">
            <h2 id="features-title">{pageCopy.featuresHeading}</h2>
            <p className="feature-panel-intro">{pageCopy.featuresIntro}</p>
            <div className="feature-list">
              {pageCopy.featureItems.map((feature) => (
                <article key={feature.title} className="feature-item">
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="content-section social-section" id="follow" aria-labelledby="follow-title">
            <h2 id="follow-title">{pageCopy.socialHeading}</h2>
            <p>{pageCopy.socialText}</p>
            <div className="contact-actions">
              <a
                className="social-link"
                href="https://www.facebook.com/folkradionazdrave"
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t.socialFacebookLabel}
              >
                <FacebookIcon />
                <span>{t.facebook}</span>
              </a>
              <a
                className="social-link"
                href="https://www.youtube.com/@dimitarzahariev8926"
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t.socialYoutubeLabel}
              >
                <YoutubeIcon />
                <span>{t.youtube}</span>
              </a>
              <a
                className="social-link"
                href="https://www.tiktok.com/@mitaka.power"
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t.socialTiktokLabel}
              >
                <TiktokIcon />
                <span>{t.tiktok}</span>
              </a>
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <p>{pageCopy.footer}</p>
        <p className="footer-credit">
          {pageCopy.footerCreditLabel}{" "}
          <a href="https://ismailov.website" target="_blank" rel="noreferrer noopener">
            ismailov.website
          </a>
        </p>
      </footer>

      <div
        className={`sticky-player ${showStickyPlayer ? "sticky-visible" : ""}`}
        ref={stickyPlayerRef}
        role="region"
        aria-label={t.stickyPlayerLabel}
        aria-hidden={!showStickyPlayer}
      >
        <span
          className={`sticky-player-art ${selectedStationId === "gold" ? "station-art-gold" : "station-art-nazdrave"}`}
          aria-hidden="true"
        >
          <img
            className="sticky-station-icon"
            src={selectedStationId === "gold" ? "/station-gold.svg" : "/station-nazdrave.svg"}
            alt=""
            aria-hidden="true"
            width="22"
            height="22"
          />
        </span>

        <div className="sticky-player-info">
          <div className="sticky-player-title">{liveTitle}</div>
          <div className="sticky-player-subtitle">{liveArtist}</div>
        </div>

        <div className="sticky-player-controls">
          <button
            type="button"
            className="sticky-play-button"
            onClick={() => void togglePlayback()}
            aria-pressed={isPlaying}
            aria-label={isLoading ? t.stop : isPlaying ? t.pause : t.play}
            tabIndex={showStickyPlayer ? 0 : -1}
          >
            {isLoading ? "…" : isPlaying ? t.pause : t.play}
          </button>
          <button
            type="button"
            className="sticky-mute-button"
            onClick={() => setIsMuted((current) => !current)}
            aria-pressed={isMuted}
            aria-label={isMuted ? t.unmute : t.mute}
            tabIndex={showStickyPlayer ? 0 : -1}
          >
            {isMuted ? t.unmute : t.mute}
          </button>
          <input
            type="range"
            className="sticky-volume"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label={`${t.volume}: ${volume}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={volume}
            tabIndex={showStickyPlayer ? 0 : -1}
          />
        </div>
      </div>

      <div className={`accessibility-widget ${accessibilityOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="accessibility-trigger"
          ref={accessibilityTriggerRef}
          aria-label={accessibilityOpen ? t.accessibilityClose : t.accessibilityOpen}
          aria-expanded={accessibilityOpen}
          aria-controls="accessibility-panel"
          onClick={() => setAccessibilityOpen((current) => !current)}
        >
          <span aria-hidden="true">A11Y</span>
          <span className="sr-only">{t.accessibilityWidget}</span>
        </button>
        <div
          className="accessibility-panel"
          id="accessibility-panel"
          role="region"
          aria-label={t.accessibilityWidget}
        >
          <p>{t.accessibilityPanelTitle}</p>
          <div className="accessibility-controls">
            <button
              type="button"
              onClick={() => setFontScale((current) => Math.max(0.95, Number((current - 0.05).toFixed(2))))}
              aria-label={t.decreaseTextSize}
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontScale((current) => Math.min(1.2, Number((current + 0.05).toFixed(2))))}
              aria-label={t.increaseTextSize}
            >
              A+
            </button>
            <button
              type="button"
              onClick={() => setHighContrast((current) => !current)}
              aria-pressed={highContrast}
              aria-label={highContrast ? t.disableHighContrast : t.enableHighContrast}
            >
              {highContrast ? t.contrastShortActive : t.contrastShort}
            </button>
            <button
              type="button"
              onClick={() => setReducedMotionMode((current) => !current)}
              aria-pressed={reducedMotionMode}
              aria-label={reducedMotionMode ? t.disableReducedMotion : t.enableReducedMotion}
            >
              {reducedMotionMode ? t.motionShortOff : t.motionShortOn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

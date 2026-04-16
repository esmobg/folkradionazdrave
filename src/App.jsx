import { useEffect, useRef, useState } from "react";
import { STATIONS, content } from "./content";

const DEFAULT_STATION_ID = STATIONS.nazdrave ? "nazdrave" : Object.keys(STATIONS)[0];
const PLAYBACK_START_TIMEOUT_MS = 6500;
const BUFFERING_RECOVERY_TIMEOUT_MS = 7000;
const BUFFERING_INDICATOR_DELAY_MS = 450;
const SAME_STREAM_RETRY_DELAY_MS = 500;
const NEXT_STREAM_RETRY_DELAY_MS = 150;
const STREAM_WARMUP_TIMEOUT_MS = 1800;
const PROXY_STREAM_REFRESH_MS = 52000;
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

function getValidStationId(stationId) {
  return STATIONS[stationId] ? stationId : DEFAULT_STATION_ID;
}

function generateWavePath(amplitude, frequency, yOffset) {
  const width = 800;
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

  const audioRef = useRef(null);
  const hasPlaybackAttemptedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const selectedStationRef = useRef(selectedStationId);
  const streamIndexRef = useRef(0);
  const retryTimerRef = useRef(null);
  const playbackStartTimerRef = useRef(null);
  const bufferingIndicatorTimerRef = useRef(null);
  const streamRefreshTimerRef = useRef(null);
  const playbackAttemptRef = useRef(0);
  const silentRefreshRef = useRef(false);
  const streamWarmupControllerRef = useRef(null);
  const warmingStreamUrlRef = useRef("");
  const warmedStreamUrlsRef = useRef(new Set());
  const playerRef = useRef(null);
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
  const stationName = selectedStation.names[language];
  const stationSubtitle = selectedStation.subtitles[language];

  function selectStation(nextStationId) {
    if (!STATIONS[nextStationId] || nextStationId === selectedStationRef.current) {
      return;
    }

    clearRetryTimer();
    clearPlaybackStartTimer();
    clearBufferingIndicatorTimer();
    clearStreamRefreshTimer();
    setTrack(null);
    setError("");

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
    document.documentElement.lang = t.htmlLang;
    document.documentElement.style.colorScheme = themeMode;
    document.title = selectedStationId === "nazdrave" ? t.station : `${stationName} | ${t.station}`;
  }, [language, selectedStationId, stationName, t.htmlLang, t.station, themeMode]);

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
      if (streamRefreshTimerRef.current) {
        window.clearTimeout(streamRefreshTimerRef.current);
      }
      streamWarmupControllerRef.current?.abort();
      warmingStreamUrlRef.current = "";
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
      silentRefreshRef.current = false;
      clearBufferingIndicatorTimer();
      clearRetryTimer();
      clearPlaybackStartTimer();
      setIsLoading(false);
      setIsPlaying(true);
      setError("");
      scheduleStreamRefresh(selectedStationRef.current, streamIndexRef.current);
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
      clearStreamRefreshTimer();

      if (silentRefreshRef.current) {
        return;
      }

      clearBufferingIndicatorTimer();
      clearPlaybackStartTimer();
      setIsLoading(false);
      setIsPlaying(false);
    };
    const onError = () => {
      silentRefreshRef.current = false;

      if (!hasPlaybackAttemptedRef.current) {
        return;
      }

      clearBufferingIndicatorTimer();
      clearRetryTimer();
      clearPlaybackStartTimer();
      clearStreamRefreshTimer();
      scheduleRetry(selectedStationRef.current, streamIndexRef.current);
    };
    const onEnded = () => {
      silentRefreshRef.current = false;

      if (!hasPlaybackAttemptedRef.current) {
        return;
      }

      clearBufferingIndicatorTimer();
      clearRetryTimer();
      clearPlaybackStartTimer();
      clearStreamRefreshTimer();
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
    clearStreamRefreshTimer();
    setTrack(null);
    setError("");
    silentRefreshRef.current = false;
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

  function warmSelectedStream() {
    const streamUrl = selectedStation.urls[0];

    if (!streamUrl || navigator.connection?.saveData || warmedStreamUrlsRef.current.has(streamUrl)) {
      return;
    }

    if (streamWarmupControllerRef.current && warmingStreamUrlRef.current === streamUrl) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, STREAM_WARMUP_TIMEOUT_MS);

    streamWarmupControllerRef.current?.abort();
    streamWarmupControllerRef.current = controller;
    warmingStreamUrlRef.current = streamUrl;

    void fetch(streamUrl, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          return;
        }

        const reader = response.body.getReader();
        await reader.read();
        warmedStreamUrlsRef.current.add(streamUrl);
        await reader.cancel();
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          warmedStreamUrlsRef.current.delete(streamUrl);
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);

        if (streamWarmupControllerRef.current === controller) {
          streamWarmupControllerRef.current = null;
        }

        if (warmingStreamUrlRef.current === streamUrl) {
          warmingStreamUrlRef.current = "";
        }
      });
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      const inFormField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const inRadioGroup = document.activeElement?.closest("[role='radiogroup']");

      if (inFormField || inRadioGroup) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      }

      if (event.code === "KeyM") {
        event.preventDefault();
        setIsMuted((current) => !current);
      }

      if (event.code === "ArrowUp") {
        event.preventDefault();
        setVolume((current) => Math.min(100, current + 10));
      }

      if (event.code === "ArrowDown") {
        event.preventDefault();
        setVolume((current) => Math.max(0, current - 10));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const playerEl = playerRef.current;

    if (!playerEl) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyPlayer(!entry.isIntersecting && hasPlaybackAttempted);
      },
      { threshold: 0.18 },
    );

    observer.observe(playerEl);
    return () => observer.disconnect();
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

  function clearStreamRefreshTimer() {
    if (streamRefreshTimerRef.current) {
      window.clearTimeout(streamRefreshTimerRef.current);
      streamRefreshTimerRef.current = null;
    }
  }

  function getRotatedStreamIndex(stationId, streamIndex) {
    const station = STATIONS[stationId];

    if (!station || station.urls.length === 0) {
      return streamIndex;
    }

    return (streamIndex + 1) % station.urls.length;
  }

  function shouldRefreshProxyStream(stationId, streamIndex) {
    const station = STATIONS[stationId];
    const streamUrl = station?.urls[streamIndex];

    if (!streamUrl || typeof window === "undefined" || LOCAL_HOSTNAMES.has(window.location.hostname)) {
      return false;
    }

  return stationId === "gold" && streamUrl.includes("/api/stream/");
  }

  function scheduleStreamRefresh(stationId, streamIndex) {
    clearStreamRefreshTimer();

    if (!shouldRefreshProxyStream(stationId, streamIndex)) {
      return;
    }

    streamRefreshTimerRef.current = window.setTimeout(() => {
      if (!isPlayingRef.current || selectedStationRef.current !== stationId) {
        return;
      }

      void attemptPlayback(stationId, getRotatedStreamIndex(stationId, streamIndex), {
        silentRefresh: true,
      });
    }, PROXY_STREAM_REFRESH_MS);
  }

  function getRetryStreamIndex(stationId, streamIndex) {
    const station = STATIONS[stationId];

    if (!station) {
      return streamIndex;
    }

    return station.urls[streamIndex + 1] ? streamIndex + 1 : streamIndex;
  }

  function scheduleRetry(stationId, streamIndex) {
    const nextStreamIndex = getRetryStreamIndex(stationId, streamIndex);
    const retryDelay = nextStreamIndex === streamIndex ? SAME_STREAM_RETRY_DELAY_MS : NEXT_STREAM_RETRY_DELAY_MS;

    retryTimerRef.current = window.setTimeout(() => {
      void attemptPlayback(stationId, nextStreamIndex);
    }, retryDelay);
  }

  async function attemptPlayback(stationId, streamIndex = 0, options = {}) {
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
    silentRefreshRef.current = options.silentRefresh === true && isPlayingRef.current;
    streamWarmupControllerRef.current?.abort();
    warmingStreamUrlRef.current = "";
    clearRetryTimer();
    clearPlaybackStartTimer();
    clearBufferingIndicatorTimer();
    clearStreamRefreshTimer();
    setError("");

    if (!silentRefreshRef.current) {
      setIsLoading(true);
    }

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

        silentRefreshRef.current = false;
        audio.pause();
        scheduleRetry(stationId, streamIndex);
      }, PLAYBACK_START_TIMEOUT_MS);
      await audio.play();
    } catch {
      silentRefreshRef.current = false;
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
      silentRefreshRef.current = false;
      clearRetryTimer();
      clearPlaybackStartTimer();
      clearBufferingIndicatorTimer();
      clearStreamRefreshTimer();
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
    showStickyPlayer ? "has-sticky-player" : "",
  ].filter(Boolean).join(" ");

  const playerCardClasses = [
    "hero-card",
    "player-card",
    selectedStationId === "gold" ? "station-gold" : "station-nazdrave",
    isPlaying ? "is-playing" : "",
  ].filter(Boolean).join(" ");

  const broadcastCards = [
    {
      label: t.liveNow,
      value: liveTitle,
      detail: liveArtist,
    },
    {
      label: t.shortcutsTitle,
      value: t.shortcuts[0],
      detail: t.shortcuts[1],
    },
    {
      label: t.highlightsLabel,
      value: `${stationsList.length} ${t.cardStations}`,
      detail: `${t.cardAccessibility}: ${t.cardAccessibilityValue}`,
    },
  ];

  const metricItems = [
    { value: "24/7", label: t.cardLive },
    { value: String(stationsList.length), label: t.cardStations },
    { value: "BG + EN", label: t.cardLanguages },
    { value: t.cardDevicesValue, label: t.cardDevices },
    { value: t.cardAccessibilityValue, label: t.cardAccessibility },
  ];

  const designCopy = language === "bg"
    ? {
        headerSubtitle: "Ясна йерархия, по-големи контроли и спокойни висококонтрастни повърхности.",
        headerBadges: ["AA контраст", "BG + EN", "Клавиатура + touch"],
        heroLabel: "Плейър, който се чете и управлява по-лесно",
        accessBadge: "Достъпно слушане",
        accessTitle: "По-малко визуален шум. Повече яснота за действие.",
        accessText:
          "Контрастът и размерите на контролите са по-високи, а текущото състояние на радиото се вижда веднага, без потребителят да сканира цялата страница.",
        accessPoints: [
          "По-големи бутони за пускане, звук и избор на станция",
          "Клавишните подсказки стоят до плейъра, а не в отделен раздел",
          "По-къси редове и по-тихи повърхности за по-спокойно четене",
        ],
        accessStats: [
          { value: "56px+", label: "Основен бутон" },
          { value: t.cardAccessibilityValue, label: t.cardAccessibility },
          { value: "BG + EN", label: t.cardLanguages },
        ],
        playerUtilities: [
          { value: t.cardAccessibilityValue, label: t.cardAccessibility },
          { value: "Space / M", label: t.shortcutsTitle },
          { value: "BG + EN", label: t.cardLanguages },
        ],
      }
    : {
        headerSubtitle: "Clearer hierarchy, larger controls, and calm high-contrast surfaces.",
        headerBadges: ["AA contrast", "BG + EN", "Keyboard + touch"],
        heroLabel: "A player that is easier to read and control",
        accessBadge: "Accessible listening",
        accessTitle: "Less visual noise. More clarity for action.",
        accessText:
          "Contrast and control sizing are stronger, while the current radio state is visible immediately without making listeners scan the full page.",
        accessPoints: [
          "Larger targets for play, mute, and station selection",
          "Keyboard hints stay next to the player instead of in a distant section",
          "Shorter line lengths and calmer surfaces for easier reading",
        ],
        accessStats: [
          { value: "56px+", label: "Primary control" },
          { value: t.cardAccessibilityValue, label: t.cardAccessibility },
          { value: "BG + EN", label: t.cardLanguages },
        ],
        playerUtilities: [
          { value: t.cardAccessibilityValue, label: t.cardAccessibility },
          { value: "Space / M", label: t.shortcutsTitle },
          { value: "BG + EN", label: t.cardLanguages },
        ],
      };

  const pageCopy = language === "bg"
    ? {
        headerEyebrow: "Фолк радио на живо",
        headerSubtitle: "Поп-фолк, народна музика и балкански ритми нон-стоп.",
        headerBadges: ["На живо 24/7", "София от 2005", "BG + EN"],
        heroLabel: "Музика с настроение",
        heroTitle: "Фолк Радио Наздраве събира поп-фолк, народна музика и балкански ритми в едно живо онлайн слушане.",
        heroText:
          "Станцията носи празнична енергия, познато звучене и бърз път до музиката. Началната страница поставя слушането на първо място и представя радиото по-ясно пред публика, клиенти и партньори.",
        broadcastCards: [
          {
            label: t.liveNow,
            value: liveTitle,
            detail: liveArtist,
          },
          {
            label: "Формат",
            value: "Поп-фолк + фолклор",
            detail: "Балкански ритми и настроение през целия ден",
          },
          {
            label: "История",
            value: "София, от 2005",
            detail: "Интернет радио с 24-часова програма",
          },
        ],
        metricItems: [
          { value: "24/7", label: "На живо" },
          { value: String(stationsList.length), label: "Станции" },
          { value: "BG + EN", label: "Езици" },
          { value: "1 клик", label: "Старт" },
          { value: "2005", label: "От" },
        ],
        playerLabel: "Слушай сега",
        playerNote:
          "Избери станция и пусни с едно натискане. Плейърът остава в центъра, за да стигнеш до музиката без излишни стъпки.",
        playerUtilities: [
          { value: "24/7", label: "На живо" },
          { value: String(stationsList.length), label: "Станции" },
          { value: "BG + EN", label: "Езици" },
        ],
        aboutBadge: "За радиото",
        aboutText:
          "Публични профили на станцията я описват като интернет радио от София, започнало през 2005 г. от трима приятели. Днес името ѝ се свързва с поп-фолк, български фолклор и балкански ритми, които държат настроението високо.",
        aboutPoints: [
          "Разпознаваем микс от поп-фолк, народна музика и балканско звучене",
          "Жив поток за ежедневно слушане, път и празнични моменти",
          "Топъл тон на бранда, близък до българската публика у нас и в чужбина",
        ],
        historyBadge: "История и формат",
        historyText:
          "Публичните радиокаталози представят станцията като 24-часово онлайн радио. В тях се споменават „Нощна музикална линия“, зоната за поздрави „ЗУРНА“, както и DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko.",
        historyPoints: [
          "София, 2005",
          "24-часова интернет програма",
          "Публично посочени предавания и DJ имена",
        ],
        clientBadge: "За клиенти",
        clientTitle: "Силен избор за обекти, събития и бранд присъствие.",
        clientText:
          "Когато ви трябва музикален фон с български и балкански характер, радиото говори на аудитория, която търси настроение, разпознаваем жанр и лесен онлайн достъп.",
        clientPoints: [
          "За заведения",
          "За събития",
          "За кампании",
        ],
        clientStats: [
          { value: "24/7", label: "Онлайн поток" },
          { value: "София", label: "Произход" },
          { value: "BG + EN", label: "Езици" },
        ],
        featuresBadge: "Предимства",
        featuresHeading: "По-ясна история за това какво е радиото и защо хората се връщат към него.",
        featuresIntro:
          "Съдържанието води с най-важното: как звучи станцията, откъде идва и къде пасва естествено.",
        featureItems: [
          {
            title: "Ясен музикален профил",
            text: "Още на първия екран става ясно, че тук живеят поп-фолк, фолклор и балкански ритми.",
          },
          {
            title: "Достоверна основа",
            text: "Ключовите факти са кратки и проверими: София, 2005, 24-часово онлайн радио.",
          },
          {
            title: "Полза за слушателя",
            text: "Текстът говори за настроение, бърз старт и познато звучене вместо за вътрешни процеси по редизайна.",
          },
          {
            title: "Полза за клиента",
            text: "Страницата представя радиото като добър избор за обекти, събития и разпознаваемо онлайн присъствие.",
          },
        ],
        testimonialsBadge: "Отзиви",
        testimonialsHeading: "Гласове, които описват настроението на радиото.",
        testimonialsIntro:
          "Кратки отзиви, които показват как слушатели, клиенти и партньори възприемат радиото.",
        testimonials: [
          {
            quote:
              "Пускам Наздраве, когато искам музиката да тръгне веднага и да държи настроение без прекъсване. Звучи познато, живо и много близо до нашия вкус.",
            name: "Слушател от София",
            role: "Редовен онлайн слушател",
          },
          {
            quote:
              "За семейни събирания и празници това е едно от малкото радиа, които улавят правилния баланс между поп-фолк, народна музика и балкански ритми.",
            name: "Организатор на събития",
            role: "Клиент за частни поводи",
          },
          {
            quote:
              "Харесва ми, че сайтът води директно към музиката, а самото радио има ясно лице. Това го прави лесно за препоръчване и за споделяне с гости и клиенти.",
            name: "Собственик на заведение",
            role: "Партньор от София",
          },
        ],
        programsBadge: "Програми и акценти",
        programPoints: [
          "„Нощна музикална линия“",
          "Зона за поздрави „ЗУРНА“",
          "Поп-фолк, народна музика и балкански ритми нон-стоп",
          "Публично споменати DJ имена: DJ Ico, DJ Mitaka, DJ Padre и DJ Vanko",
        ],
        socialBadge: "Социални канали",
        socialHeading: "Следвай радиото там, където публиката вече го търси.",
        socialText:
          "Facebook, YouTube и TikTok допълват слушането с видеа, кратки новини и още контакт с бранда.",
        footer: "Фолк Радио Наздраве онлайн, представено по-ясно за слушатели, клиенти и партньори.",
        footerCreditLabel: "Сайтът е изработен от",
      }
    : {
        headerEyebrow: "Live folk radio",
        headerSubtitle: "Pop-folk, folk music, and Balkan rhythms non-stop.",
        headerBadges: ["Live 24/7", "Sofia since 2005", "BG + EN"],
        heroLabel: "Music with mood",
        heroTitle: "Folk Radio Nazdrave brings pop-folk, folk, and Balkan rhythms together in one live online stream.",
        heroText:
          "The station brings festive energy, familiar musical cues, and a quick path to listening. The homepage puts the stream first and explains the brand more clearly to listeners, clients, and partners.",
        broadcastCards: [
          {
            label: t.liveNow,
            value: liveTitle,
            detail: liveArtist,
          },
          {
            label: "Format",
            value: "Pop-folk + folk",
            detail: "Balkan rhythms and a party-ready mood all day",
          },
          {
            label: "Story",
            value: "Sofia, since 2005",
            detail: "Internet radio with a 24-hour format",
          },
        ],
        metricItems: [
          { value: "24/7", label: "Live" },
          { value: String(stationsList.length), label: "Stations" },
          { value: "BG + EN", label: "Languages" },
          { value: "1 tap", label: "Start" },
          { value: "2005", label: "Since" },
        ],
        playerLabel: "Listen now",
        playerNote:
          "Choose a station and start with one press. The player stays central so the music is never buried under extra steps.",
        playerUtilities: [
          { value: "24/7", label: "Live" },
          { value: String(stationsList.length), label: "Stations" },
          { value: "BG + EN", label: "Languages" },
        ],
        aboutBadge: "About the station",
        aboutText:
          "Public station profiles describe it as an internet radio brand from Sofia that started in 2005, created by three friends. Today the name is associated with pop-folk, Bulgarian folk, and Balkan rhythms that keep the mood high.",
        aboutPoints: [
          "A recognizable mix of pop-folk, Bulgarian folk, and Balkan sound",
          "A live stream for everyday listening, travel, and celebrations",
          "A warm brand tone that feels close to Bulgarian listeners in Bulgaria and abroad",
        ],
        historyBadge: "History and format",
        historyText:
          "Public radio directories describe the station as a 24-hour online format. They mention Night Music Line, the request zone called ZURNA, and DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko.",
        historyPoints: [
          "Sofia, 2005",
          "24-hour internet radio programming",
          "Publicly listed shows and DJ names",
        ],
        clientBadge: "For clients",
        clientTitle: "A strong fit for venues, events, and brand presence.",
        clientText:
          "When a project needs Bulgarian and Balkan musical character, the station speaks to an audience that values mood, familiarity, and easy online access.",
        clientPoints: [
          "For venues",
          "For events",
          "For campaigns",
        ],
        clientStats: [
          { value: "24/7", label: "Online stream" },
          { value: "Sofia", label: "Origin" },
          { value: "BG + EN", label: "Languages" },
        ],
        featuresBadge: "Strengths",
        featuresHeading: "A clearer story about what the station is and why people come back to it.",
        featuresIntro:
          "The content now leads with the essentials: how the station sounds, where it comes from, and where it fits naturally.",
        featureItems: [
          {
            title: "Clear music profile",
            text: "The first screen now makes it obvious that this is a home for pop-folk, folk, and Balkan rhythms.",
          },
          {
            title: "Credible foundation",
            text: "The key facts stay short and verifiable: Sofia, 2005, and a 24-hour online radio format.",
          },
          {
            title: "Listener value",
            text: "The copy talks about mood, speed, and familiar sound instead of internal redesign language.",
          },
          {
            title: "Client value",
            text: "The page presents the station as a useful choice for venues, events, and recognizable online presence.",
          },
        ],
        testimonialsBadge: "Testimonials",
        testimonialsHeading: "Voices that capture the mood of the station.",
        testimonialsIntro:
          "Short testimonials that show how listeners, clients, and partners experience the station.",
        testimonials: [
          {
            quote:
              "I start Nazdrave when I want the music to begin instantly and keep the mood up without interruption. It feels familiar, lively, and close to our taste.",
            name: "Listener from Sofia",
            role: "Regular online listener",
          },
          {
            quote:
              "For family gatherings and celebrations, this is one of the few stations that gets the balance right between pop-folk, folk music, and Balkan rhythms.",
            name: "Event organizer",
            role: "Private-event client",
          },
          {
            quote:
              "I like that the website leads straight to the music and that the station has a clear identity. That makes it easy to recommend and easy to share with guests and clients.",
            name: "Venue owner",
            role: "Partner from Sofia",
          },
        ],
        programsBadge: "Programs and highlights",
        programPoints: [
          "Night Music Line",
          "Request zone: ZURNA",
          "Pop-folk, folk music, and Balkan rhythms non-stop",
          "Publicly listed DJs: DJ Ico, DJ Mitaka, DJ Padre, and DJ Vanko",
        ],
        socialBadge: "Social channels",
        socialHeading: "Follow the station where the audience already expects to find it.",
        socialText:
          "Facebook, YouTube, and TikTok extend the experience with videos, quick updates, and another touchpoint with the brand.",
        footer: "Folk Radio Nazdrave online, presented more clearly for listeners, clients, and partners.",
        footerCreditLabel: "Website by",
      };

  const figmaCopy = language === "bg"
    ? {
        ...designCopy,
        headerEyebrow: "Достъпно фолк радио",
        headerSubtitle: "Ясна йерархия, по-големи контроли и спокойни висококонтрастни повърхности.",
        headerBadges: ["AA контраст", "BG + EN", "Клавиатура + touch"],
        heroLabel: "Плейър, който се чете и управлява по-лесно",
        heroTitle: "Поп-фолк и фолклор с по-ясно, по-достъпно онлайн слушане.",
        heroText:
          "Редизайнът подрежда най-важното отпред: основният play control, изборът на станция, живият статус и клавишните подсказки. Топлото излъчване на бранда остава, но повърхностите стават по-тихи и по-четими.",
        playerLabel: "Плейър",
        playerNote:
          "Изборът на станция, play бутонът, силата на звука и shortcut подсказките живеят в една компактна зона с по-големи цели за натискане.",
        aboutBadge: "За радиото",
        aboutText:
          "Фолк Радио Наздраве остава празнично и разпознаваемо, но интерфейсът вече подкрепя по-добре слушане с клавиатура, мобилен touch и по-дълго четене на съдържанието.",
        aboutPoints: [
          "Плейърът е ясно отделен от останалите секции.",
          "Основните действия са групирани в една зона.",
          "Вторичните истории и клиентските секции идват след слушането, а не преди него.",
        ],
        historyBadge: "История",
        historyText:
          "Историята за старта през 2005 г. и ролята на радиото остава важна, но е подредена в по-четима карта с по-къси редове и по-спокойна типографска стъпка.",
        historyPoints: [
          "София, 2005",
          "24-часова интернет програма",
          "Ясно разграничени детайли и вторични факти",
        ],
        accessBadge: "Достъпно слушане",
        accessTitle: "По-малко визуален шум. Повече яснота за действие.",
        accessText:
          "Контрастът и размерите на контролите са по-високи, а текущото състояние на радиото се вижда веднага, без потребителят да сканира цялата страница.",
        accessPoints: [
          "По-големи бутони за пускане, звук и избор на станция",
          "Клавишните подсказки стоят до плейъра, а не в отделен раздел",
          "По-къси редове и по-тихи повърхности за по-спокойно четене",
        ],
        accessStats: [
          { value: "56px+", label: "Основен бутон" },
          { value: t.cardAccessibilityValue, label: t.cardAccessibility },
          { value: "BG + EN", label: t.cardLanguages },
        ],
        playerUtilities: [
          { value: t.cardAccessibilityValue, label: t.cardAccessibility },
          { value: "Space / M", label: t.shortcutsTitle },
          { value: "BG + EN", label: t.cardLanguages },
        ],
        featuresHeading: "По-подреден разказ за станцията и нейните силни страни.",
        featuresIntro:
          "Информационните карти стават по-къси, по-сканируеми и по-лесни за четене на мобилен екран, без да губят характера на радиото.",
        featureItems: [
          {
            title: "Разпознаваем профил",
            text: "Миксът от поп-фолк, народна музика и балкански ритми е представен по-ясно още в първия екран.",
          },
          {
            title: "Винаги онлайн",
            text: "Live статусът и готовият play control дават по-бърз път до слушането.",
          },
          {
            title: "Близо до публиката",
            text: "По-топъл, но по-спокоен визуален език намалява умората при четене.",
          },
          {
            title: "По-силно дигитално присъствие",
            text: "Историите, социалните връзки и клиентските цитати са по-добре групирани след плейъра.",
          },
        ],
        socialHeading:
          "Социалните канали остават част от историята, но вече не конкурират основния плейър.",
        socialText:
          "Facebook, YouTube и TikTok са представени като вторичен call to action след слушането и след основните аргументи за доверие.",
      }
    : {
        ...designCopy,
        headerEyebrow: "Accessible folk radio",
        headerSubtitle: "Clearer hierarchy, larger controls, and calm high-contrast surfaces.",
        headerBadges: ["AA contrast", "BG + EN", "Keyboard + touch"],
        heroLabel: "A player that is easier to read and control",
        heroTitle: "Pop-folk and folk music with clearer, more accessible online listening.",
        heroText:
          "The redesign brings the essentials forward: the main play control, station selection, live status, and keyboard hints. The warm station identity stays in place while the surfaces become calmer and easier to scan.",
        playerLabel: "Player",
        playerNote:
          "Station selection, the play button, volume, and shortcut hints live together in one compact area with larger tap targets.",
        aboutBadge: "About the station",
        aboutText:
          "Folk Radio Nazdrave stays festive and recognizable, but the interface now supports keyboard listening, mobile touch, and longer reading sessions more comfortably.",
        aboutPoints: [
          "The player is clearly separated from the supporting sections.",
          "Primary actions are grouped into one focused area.",
          "Secondary stories and client-facing content come after listening, not before it.",
        ],
        historyBadge: "History",
        historyText:
          "The 2005 Sofia origin story remains important, but it now sits inside a cleaner card with shorter line lengths and calmer typography.",
        historyPoints: [
          "Sofia, 2005",
          "24-hour internet radio programming",
          "Clear separation between primary details and secondary facts",
        ],
        featuresHeading: "A more structured story about the station and its strengths.",
        featuresIntro:
          "Information cards become shorter, more scannable, and easier to read on mobile while still keeping the station’s personality.",
        featureItems: [
          {
            title: "Recognizable profile",
            text: "The mix of pop-folk, folk, and Balkan music is explained more clearly from the first screen.",
          },
          {
            title: "Always online",
            text: "Live status and the ready play control create a faster path to listening.",
          },
          {
            title: "Close to its audience",
            text: "A warmer but calmer visual language reduces fatigue during longer reading sessions.",
          },
          {
            title: "Stronger digital presence",
            text: "Stories, social links, and trust-building content are grouped more clearly after the player.",
          },
        ],
        socialHeading:
          "The social channels stay part of the story, but they no longer compete with the main player.",
        socialText:
          "Facebook, YouTube, and TikTok now appear as a secondary call to action after listening and after the core trust-building content.",
      };

  return (
    <div className={shellClasses}>
      <a className="skip-link" href="#main-content">
        {t.skipToContent}
      </a>
      <div className="noise-layer" aria-hidden="true" />
      <div className="grid-veil" aria-hidden="true" />
      <div className="glow glow-one" aria-hidden="true" />
      <div className="glow glow-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#main-content" aria-label={t.station}>
          <img src="/logo-client.svg" alt="" className="brand-logo" aria-hidden="true" />
          <div className="brand-copy">
            <span className="eyebrow">{pageCopy.headerEyebrow}</span>
            <strong>{t.station}</strong>
            <span className="brand-support">{pageCopy.headerSubtitle}</span>
          </div>
        </a>

        <div className="header-actions">
          <div className="header-badges" aria-label={t.highlightsLabel}>
            {pageCopy.headerBadges.map((badge) => (
              <span className="header-badge" key={badge}>
                {badge}
              </span>
            ))}
          </div>

          <div className="header-toolbar">
            <div className="appearance-panel" role="group" aria-label={t.appearanceLabel}>
              <div className="control-stack">
                <span className="control-label" id="theme-label">{t.themeLabel}</span>
                <div className="segmented-control" role="radiogroup" aria-labelledby="theme-label">
                  {themeOptions.map((option) => {
                    const isActive = option.id === themeMode;

                    return (
                      <button
                        key={option.id}
                        ref={setOptionRef(themeButtonRefs, option.id)}
                        type="button"
                        className={isActive ? "segment-button active" : "segment-button"}
                        onClick={() => setThemeMode(option.id)}
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

            <nav className="top-nav" aria-label={t.navLabel}>
              <a href="#main-content">{t.navHome}</a>
              <a href="#about">{t.navExperience}</a>
              <a href="#history">{t.navFeatures}</a>
              <a href="#follow">{t.navFollow}</a>
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
                />
                <span className="lang-text">{language === "bg" ? "EN" : "BG"}</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="hero-grid">
          <section className="hero-card hero-copy" aria-label={t.station}>
            <span className="section-pill">{pageCopy.heroLabel}</span>
            <div className="hero-heading">
              <h1>{pageCopy.heroTitle}</h1>
              <p>{pageCopy.heroText}</p>
            </div>

            <div className="hero-actions">
              <a className="button button-primary" href="#player">
                {t.heroPrimary}
              </a>
              <a className="button button-secondary" href="#about">
                {t.heroSecondary}
              </a>
            </div>

            <div className="broadcast-band" aria-label={t.highlightsLabel}>
              {pageCopy.broadcastCards.map((card) => (
                <article className="band-card" key={`${card.label}-${card.value}`}>
                  <span className="band-label">{card.label}</span>
                  <strong className="band-value">{card.value}</strong>
                  <p className="band-detail">{card.detail}</p>
                </article>
              ))}
            </div>

            <div className="metric-grid" aria-label={t.highlightsLabel}>
              {pageCopy.metricItems.map((item) => (
                <article className="metric-card" key={`${item.label}-${item.value}`}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          </section>

          <section
            className={playerCardClasses}
            id="player"
            ref={playerRef}
            aria-roledescription={t.playerRoleDescription}
            aria-labelledby="player-title"
            aria-busy={isLoading}
          >
            <div className="player-heading-row">
              <div>
                <span className="section-pill">{pageCopy.playerLabel}</span>
                <h2 id="player-title">{liveTitle}</h2>
                <p className="player-subtitle">{liveArtist}</p>
              </div>

              <div className={`status-pill ${statusToneClass}`} aria-hidden="true">
                <span className="status-dot" />
                <span>{statusMessage}</span>
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

            <div className="player-visual-stack">
              <div className={`visualizer ${isPlaying ? "is-playing" : ""}`} aria-hidden="true">
                <Waveform isPlaying={isPlaying} />
              </div>

              <div className="player-facts-grid" aria-label={t.highlightsLabel}>
                {pageCopy.playerUtilities.map((item) => (
                  <article className="fact-chip" key={`${item.label}-${item.value}`}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="controls">
              <button
                type="button"
                className="play-button"
                onPointerEnter={warmSelectedStream}
                onFocus={warmSelectedStream}
                onTouchStart={warmSelectedStream}
                onClick={() => void togglePlayback()}
                aria-pressed={isPlaying}
                aria-label={isPlaying ? t.pause : t.play}
                aria-describedby="player-note player-status"
                aria-keyshortcuts="Space"
              >
                {isLoading ? t.loadingLabel : isPlaying ? t.pause : t.play}
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
          </section>
        </div>

        <section className="content-grid">
          <article className="glass-card story-card" id="about">
            <span className="section-pill">{pageCopy.aboutBadge}</span>
            <p className="lead-copy">{pageCopy.aboutText}</p>
            <ul className="point-list">
              {pageCopy.aboutPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>

          <article className="glass-card icon-card" id="history">
            <span className="section-pill">{pageCopy.historyBadge}</span>
            <p className="lead-copy">{pageCopy.historyText}</p>
            <ul className="point-list compact-list">
              {pageCopy.historyPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="glass-card access-card">
            <div className="client-copy">
              <span className="section-pill">{pageCopy.clientBadge}</span>
              <h2>{pageCopy.clientTitle}</h2>
              <p className="lead-copy">{pageCopy.clientText}</p>
              <div className="client-chip-grid" aria-label={pageCopy.clientBadge}>
                {pageCopy.clientPoints.map((item) => (
                  <span className="client-chip" key={item}>{item}</span>
                ))}
              </div>
            </div>

            <div className="client-highlights">
              <p className="client-highlights-label">{t.highlightsLabel}</p>
              <div className="access-stats" aria-label={t.highlightsLabel}>
                {pageCopy.clientStats.map((item) => (
                  <article className="access-stat" key={`${item.label}-${item.value}`}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </article>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="glass-card feature-panel" id="features" aria-labelledby="features-title">
          <div className="feature-panel-header">
            <span className="section-pill">{pageCopy.featuresBadge}</span>
            <h2 id="features-title">{pageCopy.featuresHeading}</h2>
          </div>
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

        <section className="glass-card testimonials-panel" aria-labelledby="testimonials-title">
          <div className="feature-panel-header">
            <span className="section-pill">{pageCopy.testimonialsBadge}</span>
            <h2 id="testimonials-title">{pageCopy.testimonialsHeading}</h2>
          </div>
          <p className="testimonials-intro">{pageCopy.testimonialsIntro}</p>
          <div className="testimonials-grid">
            {pageCopy.testimonials.map((testimonial) => (
              <article className="testimonial-card" key={`${testimonial.name}-${testimonial.role}`}>
                <blockquote className="testimonial-quote">"{testimonial.quote}"</blockquote>
                <p className="testimonial-name">{testimonial.name}</p>
                <p className="testimonial-role">{testimonial.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bottom-grid">
          <article className="glass-card shortcut-card">
            <span className="section-pill">{pageCopy.programsBadge}</span>
            <ul className="point-list">
              {pageCopy.programPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="glass-card social-card" id="follow">
            <span className="section-pill">{pageCopy.socialBadge}</span>
            <h2>{pageCopy.socialHeading}</h2>
            <p>{pageCopy.socialText}</p>
            <div className="contact-actions">
              <a href="https://www.facebook.com/folkradionazdrave" target="_blank" rel="noreferrer noopener">
                {t.facebook}
              </a>
              <a href="https://www.youtube.com/@dimitarzahariev8926" target="_blank" rel="noreferrer noopener">
                {t.youtube}
              </a>
              <a href="https://www.tiktok.com/@mitaka.power" target="_blank" rel="noreferrer noopener">
                {t.tiktok}
              </a>
            </div>
          </article>
        </section>
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
            onPointerEnter={warmSelectedStream}
            onFocus={warmSelectedStream}
            onTouchStart={warmSelectedStream}
            onClick={() => void togglePlayback()}
            aria-label={isPlaying ? t.pause : t.play}
            tabIndex={showStickyPlayer ? 0 : -1}
          >
            {isLoading ? "..." : isPlaying ? t.pause : t.play}
          </button>
          <button
            type="button"
            className="sticky-mute-button"
            onClick={() => setIsMuted((current) => !current)}
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

      <button
        type="button"
        className="language-float"
        onClick={() => setLanguage((current) => (current === "bg" ? "en" : "bg"))}
        aria-label={t.switchLanguage}
      >
        <img
          className="lang-icon"
          src={language === "bg" ? "/lang-en.svg" : "/lang-bg.svg"}
          alt=""
          aria-hidden="true"
        />
        <span className="lang-text">{language === "bg" ? "EN" : "BG"}</span>
      </button>
    </div>
  );
}

export default App;

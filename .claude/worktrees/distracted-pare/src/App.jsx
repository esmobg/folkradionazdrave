import { useCallback, useEffect, useRef, useState } from "react";
import { STATIONS, content } from "./content";
import {
  IconPlay, IconPause, IconLoading, IconVolume, IconMute,
  IconFacebook, IconYouTube, IconTikTok,
  IconMusic, IconRadioTower, IconUsers, IconMonitor,
  IconLive, IconStations, IconLanguages, IconDevices, IconAccessibility,
  IconQuote, IconKeyboard, IconHistory, IconAbout,
  IconStationNazdrave, IconStationGold,
} from "./Icons";

/* ── SVG Waveform component ── */
function Waveform({ isPlaying }) {
  // Generate a sine wave path that tiles seamlessly when we translateX(-50%)
  const generateWavePath = (amplitude, frequency, yOffset) => {
    const width = 800; // doubled so we can translateX(-50%) for infinite loop
    const points = [];
    for (let x = 0; x <= width; x += 4) {
      const y = yOffset + Math.sin((x / width) * Math.PI * frequency) * amplitude;
      points.push(`${x},${y.toFixed(1)}`);
    }
    return `M${points.join(" L")}`;
  };

  return (
    <svg
      className="waveform-svg"
      viewBox="0 0 400 80"
      preserveAspectRatio="none"
      aria-hidden="true"
      role="presentation"
    >
      <path className="wave-path wave-path-1" d={generateWavePath(isPlaying ? 18 : 3, 4, 40)} />
      <path className="wave-path wave-path-2" d={generateWavePath(isPlaying ? 14 : 2, 6, 40)} />
      <path className="wave-path wave-path-3" d={generateWavePath(isPlaying ? 10 : 1.5, 8, 40)} />
    </svg>
  );
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem("radio-language") || "bg");
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("radio-theme-mode") || "dark");
  const [paletteId, setPaletteId] = useState(() => localStorage.getItem("radio-palette") || "heritage");
  const [selectedStationId, setSelectedStationId] = useState(
    () => localStorage.getItem("radio-station") || "nazdrave",
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
  const selectedStationRef = useRef(selectedStationId);
  const streamIndexRef = useRef(0);
  const retryTimerRef = useRef(null);
  const playerRef = useRef(null);
  const revealRefs = useRef([]);

  const t = content[language];
  const selectedStation = STATIONS[selectedStationId];
  const stationName = selectedStation.names[language];
  const stationSubtitle = selectedStation.subtitles[language];
  const stationsList = Object.values(STATIONS);
  const themeOptions = [
    { id: "dark", label: t.darkMode },
    { id: "light", label: t.lightMode },
  ];
  const paletteOptions = [
    { id: "heritage", label: t.paletteHeritage, swatchClass: "heritage" },
    { id: "gold", label: t.paletteGold, swatchClass: "gold" },
    { id: "olive", label: t.paletteOlive, swatchClass: "olive" },
    { id: "contrast", label: t.paletteContrast, swatchClass: "contrast" },
  ];

  // ── Persist preferences ──
  useEffect(() => {
    localStorage.setItem("radio-language", language);
    localStorage.setItem("radio-theme-mode", themeMode);
    localStorage.setItem("radio-palette", paletteId);
    localStorage.setItem("radio-station", selectedStationId);
    document.documentElement.lang = t.htmlLang;
    document.documentElement.style.colorScheme = themeMode;
    document.title = selectedStationId === "nazdrave" ? t.station : `${stationName} | ${t.station}`;
  }, [language, paletteId, selectedStationId, stationName, t.htmlLang, t.station, themeMode]);

  useEffect(() => {
    selectedStationRef.current = selectedStationId;
  }, [selectedStationId]);

  // ── Audio element setup ──
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "none";
    audio.volume = volume / 100;
    audioRef.current = audio;

    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
      audio.pause();
      audio.src = "";
    };
  }, []);

  // ── Audio event listeners ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const onPlaying = () => {
      clearRetryTimer();
      setIsLoading(false);
      setIsPlaying(true);
      setError("");
    };

    const onWaiting = () => setIsLoading(true);
    const onPause = () => {
      clearRetryTimer();
      setIsLoading(false);
      setIsPlaying(false);
    };
    const onError = () => {
      if (!hasPlaybackAttemptedRef.current) {
        return;
      }

      clearRetryTimer();
      scheduleRetry(selectedStationRef.current, streamIndexRef.current);
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [t.error]);

  // ── Volume sync ──
  useEffect(() => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.volume = isMuted ? 0 : volume / 100;
  }, [volume, isMuted]);

  // ── Now-playing polling ──
  useEffect(() => {
    let ignore = false;
    const nowPlayingUrl = selectedStation.nowPlayingUrl;

    if (!nowPlayingUrl) {
      setTrack(null);
      return undefined;
    }

    async function loadTrack() {
      try {
        const response = await fetch(nowPlayingUrl);
        const data = await response.json();
        if (!ignore) {
          setTrack(data);
        }
      } catch {
        if (!ignore) {
          setTrack(null);
        }
      }
    }

    loadTrack();
    const timer = window.setInterval(loadTrack, 15000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [selectedStation]);

  // ── Station switch ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const shouldResume = isPlaying || isLoading;

    clearRetryTimer();
    setTrack(null);
    setError("");
    setIsLoading(false);
    setIsPlaying(false);
    audio.pause();
    audio.src = "";
    streamIndexRef.current = 0;

    if (shouldResume) {
      void attemptPlayback(selectedStationId, 0);
    }
  }, [selectedStationId]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKeyDown = (event) => {
      const activeElement = document.activeElement;
      const tag = activeElement?.tagName;
      const interactiveTags = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
      const isInteractiveTag = tag ? interactiveTags.has(tag) : false;
      const isInteractiveRole = activeElement?.matches?.('[role="radio"], [role="button"], [role="slider"], [role="link"], [role="textbox"]');
      const isEditable = Boolean(activeElement?.isContentEditable);

      if (isInteractiveTag || isInteractiveRole || isEditable) {
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
  }, [isLoading, isPlaying, selectedStationId]);

  // ── IntersectionObserver: sticky player visibility ──
  useEffect(() => {
    const playerEl = playerRef.current;
    if (!playerEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyPlayer(!entry.isIntersecting && hasPlaybackAttempted);
      },
      { threshold: 0.1 },
    );

    observer.observe(playerEl);
    return () => observer.disconnect();
  }, [hasPlaybackAttempted]);

  // ── IntersectionObserver: card reveal animations ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );

    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const addRevealRef = useCallback((el) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  }, []);

  const moveSelectionByOffset = useCallback((options, currentValue, onChange, offset) => {
    const currentIndex = options.findIndex((option) => option.id === currentValue);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + offset + options.length) % options.length;
    const nextId = options[nextIndex]?.id;
    if (nextId) {
      onChange(nextId);
    }
  }, []);

  const onSegmentedControlKeyDown = useCallback((event, options, currentValue, onChange) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveSelectionByOffset(options, currentValue, onChange, 1);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelectionByOffset(options, currentValue, onChange, -1);
    }
  }, [moveSelectionByOffset]);

  function clearRetryTimer() {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
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
    const nextStreamIndex = getRetryStreamIndex(stationId, streamIndex);
    const retryDelay = nextStreamIndex === streamIndex ? 12000 : 5000;

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
    streamIndexRef.current = streamIndex;
    clearRetryTimer();
    setError("");
    setIsLoading(true);

    audio.pause();
    audio.src = streamUrl;
    audio.load();

    scheduleRetry(stationId, streamIndex);

    try {
      await audio.play();
    } catch {
      clearRetryTimer();
      scheduleRetry(stationId, streamIndex);
    }
  }

  async function togglePlayback() {
    if (!audioRef.current) {
      return;
    }

    if (isPlaying || isLoading) {
      clearRetryTimer();
      audioRef.current.pause();
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    await attemptPlayback(selectedStationId, 0);
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

  const liveTitle = selectedStation.nowPlayingUrl
    ? track?.title || t.nowPlayingFallback
    : stationName;
  const liveArtist = selectedStation.nowPlayingUrl
    ? track?.artist || t.nowPlayingEmpty
    : stationSubtitle;

  const playerCardClasses = [
    "hero-card player-card",
    selectedStationId === "gold" ? "station-gold" : "station-nazdrave",
    isPlaying ? "is-playing" : "",
  ].filter(Boolean).join(" ");

  const shellClasses = [
    "page-shell",
    `mode-${themeMode}`,
    `palette-${paletteId}`,
    showStickyPlayer ? "has-sticky-player" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClasses}>
      <a className="skip-link" href="#main-content">
        {t.skipToContent}
      </a>
      <div className="noise-layer" aria-hidden="true" />
      <div className="glow glow-one" aria-hidden="true" />
      <div className="glow glow-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#main-content" aria-label={t.station}>
          <img src="/logo-client.svg" alt="" className="brand-logo" aria-hidden="true" />
          <div className="brand-copy">
            <span className="eyebrow">{t.badge}</span>
            <strong>{t.station}</strong>
            <span className="brand-slogan">{t.slogan}</span>
          </div>
        </a>

        <div className="header-actions">
          <div className="appearance-panel" role="group" aria-label={t.appearanceLabel}>
            <div className="control-stack">
              <span className="control-label" id="theme-label">{t.themeLabel}</span>
              <div
                className="segmented-control"
                role="radiogroup"
                aria-labelledby="theme-label"
                onKeyDown={(event) => onSegmentedControlKeyDown(event, themeOptions, themeMode, setThemeMode)}
              >
                {themeOptions.map((option) => {
                  const isActive = option.id === themeMode;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={isActive ? "segment-button active" : "segment-button"}
                      onClick={() => setThemeMode(option.id)}
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

            <div className="control-stack">
              <span className="control-label" id="palette-label">{t.paletteLabel}</span>
              <div
                className="segmented-control palette-control"
                role="radiogroup"
                aria-labelledby="palette-label"
                onKeyDown={(event) => onSegmentedControlKeyDown(event, paletteOptions, paletteId, setPaletteId)}
              >
                {paletteOptions.map((option) => {
                  const isActive = option.id === paletteId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={isActive ? "segment-button palette-button active" : "segment-button palette-button"}
                      onClick={() => setPaletteId(option.id)}
                      role="radio"
                      aria-checked={isActive}
                      tabIndex={isActive ? 0 : -1}
                    >
                      <span className={`palette-swatch ${option.swatchClass}`} aria-hidden="true" />
                      <span>{option.label}</span>
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
              {language === "bg" ? "EN" : "BG"}
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="hero-grid" aria-label={t.station}>
          <section className="hero-card hero-copy">
            <span className="section-pill">{t.badge}</span>
            <h1>{t.heroTitle}</h1>
            <p>{t.heroText}</p>

            <div className="hero-actions">
              <a className="button button-primary" href="#player">
                {t.heroPrimary}
              </a>
              <a className="button button-secondary" href="#about">
                {t.heroSecondary}
              </a>
            </div>

            <div className="brand-showcase">
              <div className="brand-ring">
                <img src="/hero-stage.svg" alt="" className="hero-artwork" aria-hidden="true" />
                <div className="hero-seal">
                  <img src="/logo-client.svg" alt="" className="hero-seal-logo" aria-hidden="true" />
                  <div className="hero-seal-copy">
                    <span>{t.liveNow}</span>
                    <strong>{stationName}</strong>
                    <small>{stationSubtitle}</small>
                  </div>
                </div>
              </div>

              <aside className="hero-signal-card" aria-label={t.highlightsLabel}>
                <span className="signal-pill">{t.liveNow}</span>
                <strong>{stationName}</strong>
                <p>{stationSubtitle}</p>
                <div className="signal-kpi-row">
                  <article className="signal-kpi">
                    <span>24/7</span>
                    <small>{t.cardLive}</small>
                  </article>
                  <article className="signal-kpi">
                    <span>{stationsList.length}</span>
                    <small>{t.cardStations}</small>
                  </article>
                  <article className="signal-kpi">
                    <span>BG + EN</span>
                    <small>{t.cardLanguages}</small>
                  </article>
                </div>
              </aside>
            </div>

            <div className="metric-grid" aria-label={t.highlightsLabel}>
              <article className="metric-card">
                <IconLive className="metric-icon" />
                <strong>24/7</strong>
                <span>{t.cardLive}</span>
              </article>
              <article className="metric-card">
                <IconStations className="metric-icon" />
                <strong>{stationsList.length}</strong>
                <span>{t.cardStations}</span>
              </article>
              <article className="metric-card">
                <IconLanguages className="metric-icon" />
                <strong>BG + EN</strong>
                <span>{t.cardLanguages}</span>
              </article>
              <article className="metric-card">
                <IconDevices className="metric-icon" />
                <strong>{t.cardDevicesValue}</strong>
                <span>{t.cardDevices}</span>
              </article>
              <article className="metric-card">
                <IconAccessibility className="metric-icon" />
                <strong>{t.cardAccessibilityValue}</strong>
                <span>{t.cardAccessibility}</span>
              </article>
            </div>
          </section>

          <aside
            className={playerCardClasses}
            id="player"
            ref={playerRef}
            role="region"
            aria-roledescription={t.playerRoleDescription}
            aria-labelledby="player-title"
            aria-busy={isLoading}
          >
            <span className="section-pill">{t.liveNow}</span>
            <h2 id="player-title">{liveTitle}</h2>
            <p className="player-subtitle">{liveArtist}</p>
            <p className="player-note">{t.playerDescription}</p>

            <div
              className="station-picker"
              role="radiogroup"
              aria-label={t.selectStation}
              onKeyDown={(event) => onSegmentedControlKeyDown(event, stationsList, selectedStationId, setSelectedStationId)}
            >
              {stationsList.map((station) => {
                const isActive = station.id === selectedStationId;
                const artClass = station.id === "gold" ? "station-art station-art-gold" : "station-art station-art-nazdrave";
                const StationIcon = station.id === "gold" ? IconStationGold : IconStationNazdrave;

                return (
                  <button
                    key={station.id}
                    type="button"
                    className={isActive ? "station-button active" : "station-button"}
                    onClick={() => setSelectedStationId(station.id)}
                    role="radio"
                    aria-checked={isActive}
                    tabIndex={isActive ? 0 : -1}
                  >
                    <span className={artClass} aria-hidden="true">
                      <StationIcon className="station-icon" />
                    </span>
                    <div className="station-button-content">
                      <span>{station.names[language]}</span>
                      <small>{station.subtitles[language]}</small>
                    </div>
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
                onClick={() => void togglePlayback()}
                aria-pressed={isPlaying}
                aria-label={isPlaying ? t.pause : t.play}
              >
                {isLoading ? (
                  <><IconLoading className="btn-icon" />{t.loadingLabel}</>
                ) : isPlaying ? (
                  <><IconPause className="btn-icon" />{t.pause}</>
                ) : (
                  <><IconPlay className="btn-icon" />{t.play}</>
                )}
              </button>

              <button
                type="button"
                className="icon-button"
                onClick={() => setIsMuted((current) => !current)}
                aria-pressed={isMuted}
                aria-label={isMuted ? t.unmute : t.mute}
              >
                {isMuted ? <IconMute className="btn-icon" /> : <IconVolume className="btn-icon" />}
              </button>
            </div>

            <label className="slider-wrap">
              <span className="volume-label"><IconVolume className="volume-icon" />{t.volume}</span>
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
              className="status-line"
              role="status"
              aria-live={error ? "assertive" : "polite"}
              aria-describedby={error ? "player-title" : undefined}
            >
              {statusMessage}
            </p>
          </aside>
        </section>

        <section className="content-grid">
          <article className="glass-card story-card card-reveal" id="about" ref={addRevealRef}>
            <span className="section-pill">{t.experienceTitle}</span>
            <IconAbout className="section-icon" />
            <p className="lead-copy">{t.experienceText}</p>
            <ul className="point-list">
              {t.experiencePoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>

          <article className="glass-card icon-card card-reveal" id="history" ref={addRevealRef}>
            <span className="section-pill">{t.editorialTitle}</span>
            <img src="/icon.svg" alt="" className="feature-icon-large" aria-hidden="true" />
            <h3>{t.station}</h3>
            <p>{t.editorialBody}</p>
            <ul className="point-list compact-list">
              {t.editorialList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="glass-card feature-panel card-reveal" id="features" ref={addRevealRef}>
          <div className="feature-panel-header">
            <span className="section-pill">{t.featuresTitle}</span>
            <h2>{t.featuresTitle}</h2>
          </div>

          <div className="feature-list">
            {t.features.map((feature, index) => {
              const featureIcons = [IconMusic, IconRadioTower, IconUsers, IconMonitor];
              const FeatureIcon = featureIcons[index] || IconMusic;
              return (
                <article key={feature.title} className="feature-item card-reveal" ref={addRevealRef}>
                  <FeatureIcon className="feature-icon" />
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="glass-card testimonials-panel card-reveal" aria-labelledby="testimonials-title" ref={addRevealRef}>
          <div className="feature-panel-header">
            <span className="section-pill">{t.testimonialsTitle}</span>
            <h2 id="testimonials-title">{t.testimonialsTitle}</h2>
          </div>
          <p className="testimonials-intro">{t.testimonialsIntro}</p>
          <div className="testimonials-grid">
            {t.testimonials.map((testimonial) => (
              <article className="testimonial-card card-reveal" key={`${testimonial.name}-${testimonial.role}`} ref={addRevealRef}>
                <IconQuote className="quote-icon" />
                <p className="testimonial-quote">"{testimonial.quote}"</p>
                <p className="testimonial-name">{testimonial.name}</p>
                <p className="testimonial-role">{testimonial.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bottom-grid">
          <article className="glass-card shortcut-card card-reveal" ref={addRevealRef}>
            <span className="section-pill">{t.shortcutsTitle}</span>
            <IconKeyboard className="section-icon" />
            <ul className="point-list">
              {t.shortcuts.map((shortcut) => (
                <li key={shortcut}>{shortcut}</li>
              ))}
            </ul>
          </article>

          <article className="glass-card social-card card-reveal" id="follow" ref={addRevealRef}>
            <span className="section-pill">{t.socialTitle}</span>
            <h2>{t.socialTitle}</h2>
            <p>{t.socialText}</p>
            <div className="contact-actions">
              <a href="https://www.facebook.com/folkradionazdrave" target="_blank" rel="noreferrer noopener">
                <IconFacebook className="social-icon" />{t.facebook}
              </a>
              <a href="https://www.youtube.com/@dimitarzahariev8926" target="_blank" rel="noreferrer noopener">
                <IconYouTube className="social-icon" />{t.youtube}
              </a>
              <a href="https://www.tiktok.com/@mitaka.power" target="_blank" rel="noreferrer noopener">
                <IconTikTok className="social-icon" />{t.tiktok}
              </a>
            </div>
          </article>
        </section>
      </main>

      <footer className="site-footer">
        <p>{t.footer}</p>
      </footer>

      {/* ── Sticky bottom player bar ── */}
      <div
        className={`sticky-player ${showStickyPlayer ? "sticky-visible" : ""}`}
        role="region"
        aria-label={t.playerRoleDescription}
        aria-hidden={!showStickyPlayer}
      >
        <span
          className={`sticky-player-art ${selectedStationId === "gold" ? "station-art-gold" : "station-art-nazdrave"}`}
          aria-hidden="true"
        />
        <div className="sticky-player-info">
          <div className="sticky-player-title">{liveTitle}</div>
          <div className="sticky-player-subtitle">{liveArtist}</div>
        </div>
        <div className="sticky-player-controls">
          <button
            type="button"
            className="sticky-play-button"
            onClick={() => void togglePlayback()}
            aria-label={isPlaying ? t.pause : t.play}
            tabIndex={showStickyPlayer ? 0 : -1}
          >
            {isLoading ? <IconLoading className="sticky-btn-icon" /> : isPlaying ? <IconPause className="sticky-btn-icon" /> : <IconPlay className="sticky-btn-icon" />}
          </button>
          <button
            type="button"
            className="sticky-mute-button"
            onClick={() => setIsMuted((current) => !current)}
            aria-label={isMuted ? t.unmute : t.mute}
            tabIndex={showStickyPlayer ? 0 : -1}
          >
            {isMuted ? <IconMute className="sticky-btn-icon" /> : <IconVolume className="sticky-btn-icon" />}
          </button>
          <input
            type="range"
            className="sticky-volume"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-labelledby="sticky-volume-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={volume}
            tabIndex={showStickyPlayer ? 0 : -1}
          />
          <span className="sr-only" id="sticky-volume-label">
            {`${t.volume}: ${volume}%`}
          </span>
        </div>
      </div>

      {/* ── Floating mobile language toggle ── */}
      <button
        type="button"
        className="language-float"
        onClick={() => setLanguage((current) => (current === "bg" ? "en" : "bg"))}
        aria-label={t.switchLanguage}
      >
        {language === "bg" ? "EN" : "BG"}
      </button>
    </div>
  );
}

export default App;

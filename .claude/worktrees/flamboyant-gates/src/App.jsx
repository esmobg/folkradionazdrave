import { useEffect, useRef, useState } from "react";
import { STATIONS, content } from "./content";

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
  const [volume, setVolume] = useState(70);
  const [track, setTrack] = useState(null);
  const [error, setError] = useState("");
  const audioRef = useRef(null);
  const selectedStationRef = useRef(selectedStationId);
  const streamIndexRef = useRef(0);
  const retryTimerRef = useRef(null);
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
  ];

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
      clearRetryTimer();
      void attemptPlayback(selectedStationRef.current, streamIndexRef.current + 1);
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

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.volume = isMuted ? 0 : volume / 100;
  }, [volume, isMuted]);

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

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      const inFormField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (inFormField) {
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

  function clearRetryTimer() {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  async function attemptPlayback(stationId, streamIndex = 0) {
    const audio = audioRef.current;
    const station = STATIONS[stationId];

    if (!audio || !station) {
      return;
    }

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

    retryTimerRef.current = window.setTimeout(() => {
      void attemptPlayback(stationId, streamIndex + 1);
    }, 5000);

    try {
      await audio.play();
    } catch {
      clearRetryTimer();
      void attemptPlayback(stationId, streamIndex + 1);
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
    ? error
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

  return (
    <div className={`page-shell mode-${themeMode} palette-${paletteId}`}>
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
          </div>
        </a>

        <div className="header-actions">
          <div className="appearance-panel" aria-label={t.appearanceLabel}>
            <div className="control-stack">
              <span className="control-label">{t.themeLabel}</span>
              <div className="segmented-control" role="group" aria-label={t.themeLabel}>
                {themeOptions.map((option) => {
                  const isActive = option.id === themeMode;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={isActive ? "segment-button active" : "segment-button"}
                      onClick={() => setThemeMode(option.id)}
                      aria-pressed={isActive}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="control-stack">
              <span className="control-label">{t.paletteLabel}</span>
              <div className="segmented-control palette-control" role="group" aria-label={t.paletteLabel}>
                {paletteOptions.map((option) => {
                  const isActive = option.id === paletteId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={isActive ? "segment-button palette-button active" : "segment-button palette-button"}
                      onClick={() => setPaletteId(option.id)}
                      aria-pressed={isActive}
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
        <section className="hero-grid" aria-label={t.heroTitle}>
          <div className="hero-card hero-copy">
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
                <img src="/logo-client.svg" alt={t.station} className="hero-logo" />
              </div>
            </div>

            <div className="metric-grid" aria-label={t.highlightsLabel}>
              <div className="metric-card">
                <strong>{t.cardLiveValue}</strong>
                <span>{t.cardLive}</span>
              </div>
              <div className="metric-card">
                <strong>{t.cardYearsValue}</strong>
                <span>{t.cardYears}</span>
              </div>
              <div className="metric-card">
                <strong>{t.cardLanguagesValue}</strong>
                <span>{t.cardLanguages}</span>
              </div>
              <div className="metric-card">
                <strong>{t.cardDevicesValue}</strong>
                <span>{t.cardDevices}</span>
              </div>
              <div className="metric-card">
                <strong>{t.cardAccessibilityValue}</strong>
                <span>{t.cardAccessibility}</span>
              </div>
            </div>
          </div>

          <section
            className={`hero-card player-card ${selectedStationId === "gold" ? "station-gold" : "station-nazdrave"}`}
            id="player"
            aria-labelledby="player-title"
          >
            <span className="section-pill">{t.liveNow}</span>
            <h2 id="player-title">{liveTitle}</h2>
            <p className="player-subtitle">{liveArtist}</p>
            <p className="player-note">{t.playerDescription}</p>

            <div className="station-picker" role="group" aria-label={t.selectStation}>
              {stationsList.map((station) => {
                const isActive = station.id === selectedStationId;

                return (
                  <button
                    key={station.id}
                    type="button"
                    className={isActive ? "station-button active" : "station-button"}
                    onClick={() => setSelectedStationId(station.id)}
                    aria-pressed={isActive}
                  >
                    <span>{station.names[language]}</span>
                    <small>{station.subtitles[language]}</small>
                  </button>
                );
              })}
            </div>

            {selectedStationId === "gold" ? (
              <p className="station-note">{t.backupStreamReady}</p>
            ) : null}

            <div className="visualizer" aria-hidden="true">
              <span className={`bar${isPlaying ? " active" : ""}${isLoading ? " loading" : ""}`} />
              <span className={`bar${isPlaying ? " active delay-1" : ""}${isLoading ? " loading delay-1" : ""}`} />
              <span className={`bar${isPlaying ? " active delay-2" : ""}${isLoading ? " loading delay-2" : ""}`} />
              <span className={`bar${isPlaying ? " active delay-3" : ""}${isLoading ? " loading delay-3" : ""}`} />
              <span className={`bar${isPlaying ? " active delay-4" : ""}${isLoading ? " loading delay-4" : ""}`} />
            </div>

            <div className="controls">
              <button
                type="button"
                className={`play-button${isLoading ? " is-loading" : ""}`}
                onClick={() => void togglePlayback()}
                aria-pressed={isPlaying}
                aria-label={isLoading ? t.loading : isPlaying ? t.pause : t.play}
              >
                {isLoading ? null : isPlaying ? t.pause : t.play}
              </button>

              <button
                type="button"
                className="icon-button"
                onClick={() => setIsMuted((current) => !current)}
                aria-pressed={isMuted}
                aria-label={isMuted ? t.unmute : t.mute}
              >
                {isMuted ? t.unmute : t.mute}
              </button>
            </div>

            {error ? (
              <div className="player-error">
                <p>{error}</p>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setError("");
                    void attemptPlayback(selectedStationId, 0);
                  }}
                >
                  {t.retry}
                </button>
              </div>
            ) : null}

            <label className="slider-wrap">
              <span>{t.volume}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                style={{ "--volume-pct": `${volume}%` }}
                onChange={(event) => {
                  const newVolume = Number(event.target.value);
                  setVolume(newVolume);
                  if (isMuted && newVolume > 0) {
                    setIsMuted(false);
                  }
                }}
              />
              <strong>{volume}%</strong>
            </label>

            <p className="status-line" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </section>
        </section>

        <section className="content-grid">
          <article className="glass-card story-card" id="about">
            <span className="section-pill">{t.experienceTitle}</span>
            <p className="lead-copy">{t.experienceText}</p>
            <ul className="point-list">
              {t.experiencePoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>

          <article className="glass-card icon-card" id="history">
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

        <section className="glass-card feature-panel" id="features">
          <div className="feature-panel-header">
            <span className="section-pill" aria-hidden="true">{t.featuresTitle}</span>
            <h2>{t.featuresTitle}</h2>
          </div>

          <div className="feature-list">
            {t.features.map((feature) => (
              <article key={feature.title} className="feature-item">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-card testimonials-panel" aria-labelledby="testimonials-title">
          <div className="feature-panel-header">
            <span className="section-pill" aria-hidden="true">{t.testimonialsTitle}</span>
            <h2 id="testimonials-title">{t.testimonialsTitle}</h2>
          </div>
          <p className="testimonials-intro">{t.testimonialsIntro}</p>
          <div className="testimonials-grid">
            {t.testimonials.map((testimonial) => (
              <blockquote className="testimonial-card" key={`${testimonial.name}-${testimonial.role}`}>
                <p className="testimonial-quote">{testimonial.quote}</p>
                <footer className="testimonial-footer">
                  <cite className="testimonial-name">{testimonial.name}</cite>
                  <p className="testimonial-role">{testimonial.role}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        <section className="bottom-grid">
          <article className="glass-card shortcut-card">
            <span className="section-pill">{t.shortcutsTitle}</span>
            <dl className="shortcut-list">
              {t.shortcuts.map((shortcut) => (
                <div className="shortcut-row" key={shortcut.key}>
                  <dt><kbd>{shortcut.key}</kbd></dt>
                  <dd>{shortcut.action}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="glass-card social-card" id="follow">
            <span className="section-pill">{t.socialTitle}</span>
            <h2>{t.socialTitle}</h2>
            <p>{t.socialText}</p>
            <div className="contact-actions">
              <a href="https://www.facebook.com/folkradionazdrave" target="_blank" rel="noreferrer">
                {t.facebook}
                <span className="sr-only"> ({t.newWindow})</span>
              </a>
              <a href="https://www.youtube.com/@dimitarzahariev8926" target="_blank" rel="noreferrer">
                {t.youtube}
                <span className="sr-only"> ({t.newWindow})</span>
              </a>
              <a href="https://www.tiktok.com/@mitaka.power" target="_blank" rel="noreferrer">
                {t.tiktok}
                <span className="sr-only"> ({t.newWindow})</span>
              </a>
            </div>
          </article>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <img src="/logo-client.svg" alt="" className="footer-logo" aria-hidden="true" />
          <strong className="footer-name">{t.station}</strong>
        </div>
        <p className="footer-copy">{t.footer}</p>
      </footer>
    </div>
  );
}

export default App;

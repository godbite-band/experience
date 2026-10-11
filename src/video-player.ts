import { copy, type Language } from './content';

interface Player {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YouTubeAPI {
  Player: new (frame: HTMLIFrameElement, options: { events: {
    onReady(): void; onStateChange(): void; onError(): void;
  } }) => Player;
}
const youtubeWindow = window as typeof window & { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeAPI> | undefined;
function loadAPI() {
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT);
  if (!apiPromise) apiPromise = new Promise<YouTubeAPI>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YouTube API unavailable')), 12000);
    const previous = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previous?.(); clearTimeout(timeout);
      if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT);
      else reject(new Error('YouTube API unavailable'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timeout); reject(new Error('YouTube API unavailable')); };
    document.head.append(script);
  });
  return apiPromise;
}
function time(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Keep YouTube's video intact; our controls sit below its viewport. */
export class VideoPlayer {
  private player?: Player;
  private disposed = false;
  private nativeControls = false;
  private timer?: number;
  private readyTimeout?: number;
  private language: Language;
  private frame = document.createElement('iframe');
  private controls = document.createElement('div');
  private toggle = document.createElement('button');
  private seek = document.createElement('input');
  private clock = document.createElement('span');
  private fullscreen = document.createElement('button');
  private external = document.createElement('a');
  private status = document.createElement('span');

  constructor(private container: HTMLElement, title: string, youtubeId: string, language: Language) {
    this.language = language;
    this.frame.title = title;
    const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1', controls: '0',
      enablejsapi: '1', origin: location.origin, iv_load_policy: '3', hl: language });
    this.frame.src = `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;
    this.frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    this.frame.allowFullscreen = true;
    this.frame.referrerPolicy = 'strict-origin-when-cross-origin';
    this.controls.className = 'video-controls';
    this.toggle.type = this.fullscreen.type = 'button';
    this.toggle.disabled = true;
    this.seek.type = 'range'; this.seek.min = '0'; this.seek.max = '0'; this.seek.step = '1'; this.seek.value = '0';
    this.seek.disabled = true;
    this.clock.className = 'video-time'; this.clock.textContent = '0:00 / 0:00';
    this.fullscreen.textContent = '⛶'; this.fullscreen.hidden = !document.fullscreenEnabled;
    this.external.href = 'https://www.youtube.com/watch?v=' + youtubeId;
    this.external.target = '_blank'; this.external.rel = 'noopener noreferrer'; this.external.textContent = 'YouTube ↗';
    this.status.className = 'video-status'; this.status.setAttribute('role', 'status');
    this.controls.append(this.toggle, this.seek, this.clock, this.fullscreen, this.external);
    this.container.classList.add('video-player');
    this.container.replaceChildren(this.frame, this.controls, this.status);
    this.translate(language);
    this.toggle.addEventListener('click', () => {
      if (this.player?.getPlayerState() === 1) this.player.pauseVideo(); else this.player?.playVideo();
    });
    this.seek.addEventListener('input', () => { this.clock.textContent = `${time(Number(this.seek.value))} / ${time(Number(this.seek.max))}`; });
    this.seek.addEventListener('change', () => this.player?.seekTo(Number(this.seek.value), true));
    this.fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === this.container) await document.exitFullscreen();
        else await this.container.requestFullscreen();
      } catch { this.status.textContent = copy[this.language].fullscreenFailed; }
    });
    document.addEventListener('fullscreenchange', this.updateFullscreen);
    this.readyTimeout = window.setTimeout(() => this.fallback(), 15000);
    void loadAPI().then(api => {
      if (this.disposed) return;
      this.player = new api.Player(this.frame, { events: {
        onReady: () => {
          if (this.disposed || this.nativeControls) return;
          clearTimeout(this.readyTimeout); this.toggle.disabled = false;
          this.timer = window.setInterval(() => this.update(), 250); this.update();
        },
        onStateChange: () => { if (!this.disposed && !this.nativeControls) this.update(); },
        onError: () => { if (!this.disposed && !this.nativeControls) this.status.textContent = copy[this.language].failedFilm; },
      } });
    }).catch(() => this.fallback());
  }

  private fallback() {
    if (this.disposed || !this.toggle.disabled) return;
    this.nativeControls = true;
    clearTimeout(this.readyTimeout);
    // Native controls remain usable if the API cannot load.
    this.player?.destroy(); this.player = undefined;
    const url = new URL(this.frame.src); url.searchParams.set('controls', '1'); url.searchParams.set('enablejsapi', '0');
    this.frame.src = url.href;
    this.container.prepend(this.frame);
    this.toggle.hidden = this.seek.hidden = this.clock.hidden = true;
  }
  private update() {
    if (!this.player || this.nativeControls) return;
    const duration = this.player.getDuration() || 0, current = this.player.getCurrentTime() || 0;
    this.seek.disabled = duration <= 0; this.seek.max = String(duration);
    if (document.activeElement !== this.seek) this.seek.value = String(current);
    this.clock.textContent = `${time(current)} / ${time(duration)}`;
    const playing = this.player.getPlayerState() === 1;
    this.toggle.textContent = playing ? 'Ⅱ' : '▷';
    this.toggle.setAttribute('aria-label', copy[this.language][playing ? 'pauseVideo' : 'play']);
  }
  private updateFullscreen = () => {
    const active = document.fullscreenElement === this.container;
    this.fullscreen.setAttribute('aria-label', copy[this.language][active ? 'exitFullscreen' : 'enterFullscreen']);
    this.fullscreen.setAttribute('aria-pressed', String(active));
  };
  translate(language: Language) {
    this.language = language;
    this.toggle.textContent ||= '▷'; this.toggle.setAttribute('aria-label', copy[language].play);
    this.seek.setAttribute('aria-label', copy[language].seekVideo);
    this.external.setAttribute('aria-label', copy[language].external);
    this.updateFullscreen(); this.update();
  }
  destroy() {
    this.disposed = true; clearInterval(this.timer); clearTimeout(this.readyTimeout);
    document.removeEventListener('fullscreenchange', this.updateFullscreen);
    this.player?.destroy(); this.container.replaceChildren();
  }
}

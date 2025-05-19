/**
 * Media Player Service - Handles local video playback
 */

export default class MediaPlayerService {
  constructor() {
    this.videoElement = null;
    this.eventListeners = {
      timeUpdate: [],
      durationChange: [],
      play: [],
      pause: [],
      ended: [],
      error: [],
      loadedData: [],
      volumeChange: []
    };
    this.isInitialized = false;
  }

  initialize(videoElement) {
    if (!videoElement) {
      console.error('No video element provided');
      return false;
    }

    this.videoElement = videoElement;
    this.setupEventListeners();
    this.isInitialized = true;
    return true;
  }

  setupEventListeners() {
    if (!this.videoElement) return;

    // Time update
    this.videoElement.addEventListener('timeupdate', () => {
      this.eventListeners.timeUpdate.forEach(callback => 
        callback(this.videoElement.currentTime)
      );
    });

    // Duration change
    this.videoElement.addEventListener('durationchange', () => {
      this.eventListeners.durationChange.forEach(callback => 
        callback(this.videoElement.duration)
      );
    });

    // Play event
    this.videoElement.addEventListener('play', () => {
      this.eventListeners.play.forEach(callback => callback());
    });

    // Pause event
    this.videoElement.addEventListener('pause', () => {
      this.eventListeners.pause.forEach(callback => callback());
    });

    // Ended event
    this.videoElement.addEventListener('ended', () => {
      this.eventListeners.ended.forEach(callback => callback());
    });

    // Error event
    this.videoElement.addEventListener('error', (event) => {
      this.eventListeners.error.forEach(callback => 
        callback(this.videoElement.error)
      );
    });

    // Loaded data event
    this.videoElement.addEventListener('loadeddata', () => {
      this.eventListeners.loadedData.forEach(callback => callback());
    });

    // Volume change event
    this.videoElement.addEventListener('volumechange', () => {
      this.eventListeners.volumeChange.forEach(callback => 
        callback({
          volume: this.videoElement.volume,
          muted: this.videoElement.muted
        })
      );
    });
  }

  // Event listener management
  on(eventName, callback) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName].push(callback);
    }
  }

  off(eventName, callback) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName] = this.eventListeners[eventName]
        .filter(cb => cb !== callback);
    }
  }

  // Media state getters
  getCurrentTime() {
    return this.videoElement ? this.videoElement.currentTime : 0;
  }

  getDuration() {
    return this.videoElement ? this.videoElement.duration : 0;
  }

  isPaused() {
    return this.videoElement ? this.videoElement.paused : true;
  }

  isEnded() {
    return this.videoElement ? this.videoElement.ended : false;
  }

  getVolume() {
    return this.videoElement ? this.videoElement.volume : 1;
  }

  isMuted() {
    return this.videoElement ? this.videoElement.muted : false;
  }

  // Media control methods
  load(url) {
    if (!this.videoElement || !url) return;
    
    this.videoElement.src = url;
    this.videoElement.load();
  }

  play() {
    if (!this.videoElement) return Promise.reject('No video element');
    return this.videoElement.play();
  }

  pause() {
    if (!this.videoElement) return;
    this.videoElement.pause();
  }

  stop() {
    if (!this.videoElement) return;
    this.videoElement.pause();
    this.videoElement.currentTime = 0;
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
  }

  seek(time) {
    if (!this.videoElement) return;
    this.videoElement.currentTime = time;
  }

  setVolume(volumeLevel) {
    if (!this.videoElement) return;
    this.videoElement.volume = Math.max(0, Math.min(1, volumeLevel));
  }

  mute() {
    if (!this.videoElement) return;
    this.videoElement.muted = true;
  }

  unmute() {
    if (!this.videoElement) return;
    this.videoElement.muted = false;
  }

  isMediaLoaded(url) {
    if (!this.videoElement) return false;
    if (!url) {
      return (this.videoElement.src !== null && this.videoElement.src !== "");
    } else {
      return (this.videoElement.src === url);
    }
  }
}

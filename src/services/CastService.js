/**
 * Cast Service - Handles all interactions with the Google Cast SDK
 */

export default class CastService {
  constructor() {
    this.castContext = null;
    this.remotePlayer = null;
    this.remotePlayerController = null;
    this.sessionInitialized = false;
    this.eventListeners = {
      connectionChanged: [],
      mediaInfoChanged: [],
      playerStateChanged: [],
      timeChanged: [],
      durationChanged: [],
      volumeChanged: [],
      isMutedChanged: [],
      queueChanged: [],
      liveSeekableRangeChanged: []
    };
  }

  initialize(receiverAppId = '67338B81') {
    console.log('Initializing Cast Service');
    
    if (typeof chrome === 'undefined' || !chrome.cast || !chrome.cast.isAvailable) {
      console.error('Chrome Cast API not available');
      return false;
    }

    try {
      const options = {
        receiverApplicationId: receiverAppId,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        androidReceiverCompatible: true
      };

      this.castContext = cast.framework.CastContext.getInstance();
      this.castContext.setOptions(options);

      this.remotePlayer = new cast.framework.RemotePlayer();
      this.remotePlayerController = new cast.framework.RemotePlayerController(this.remotePlayer);

      this.setupEventListeners();
      this.sessionInitialized = true;
      console.log('Cast Service initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing Cast Service:', error);
      return false;
    }
  }

  setupEventListeners() {
    // Connection state change
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
      event => {
        this.eventListeners.connectionChanged.forEach(callback => 
          callback(event.value)
        );
      }
    );

    // Media info changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.MEDIA_INFO_CHANGED,
      () => {
        const mediaInfo = this.getMediaInfo();
        this.eventListeners.mediaInfoChanged.forEach(callback => 
          callback(mediaInfo)
        );
      }
    );

    // Player state changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
      () => {
        const playerState = this.remotePlayer.playerState;
        this.eventListeners.playerStateChanged.forEach(callback => 
          callback(playerState)
        );
      }
    );

    // Current time changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
      event => {
        this.eventListeners.timeChanged.forEach(callback => 
          callback(event.value)
        );
      }
    );

    // Duration changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.DURATION_CHANGED,
      event => {
        this.eventListeners.durationChanged.forEach(callback => 
          callback(event.value)
        );
      }
    );

    // Volume changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.VOLUME_LEVEL_CHANGED,
      () => {
        const volume = this.remotePlayer.volumeLevel;
        this.eventListeners.volumeChanged.forEach(callback => 
          callback(volume)
        );
      }
    );

    // Mute state changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED,
      () => {
        const isMuted = this.remotePlayer.isMuted;
        this.eventListeners.isMutedChanged.forEach(callback => 
          callback(isMuted)
        );
      }
    );

    // Queue changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.QUEUE_DATA_CHANGED,
      () => {
        const queue = this.getQueueItems();
        this.eventListeners.queueChanged.forEach(callback => 
          callback(queue)
        );
      }
    );

    // Live seekable range changes
    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.LIVE_SEEKABLE_RANGE_CHANGED,
      event => {
        this.eventListeners.liveSeekableRangeChanged.forEach(callback => 
          callback(event.value)
        );
      }
    );
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

  // Cast state getters
  isConnected() {
    return this.remotePlayer && this.remotePlayer.isConnected;
  }

  isFullscreen() {
    if (!this.isConnected()) return false;
    
    const session = this.castContext.getCurrentSession();
    if (!session) return false;
    
    const mediaSession = session.getMediaSession();
    if (!mediaSession ) return false;
    
    return mediaSession.customData && mediaSession.customData.fullscreen;
  }

  getMediaInfo() {
    if (!this.isConnected()) return null;
    
    const session = this.castContext.getCurrentSession();
    if (!session) return null;
    
    const mediaSession = session.getMediaSession();
    if (!mediaSession || !mediaSession.media) return null;
    return mediaSession.media;
  }

  getMediaCurrentTime() {
    if (!this.isConnected()) return 0;
    return this.remotePlayer.currentTime || 0;
  }

  getMediaDuration() {
    if (!this.isConnected()) return 0;
    return this.remotePlayer.duration || 0;
  }

  isPaused() {
    if (!this.isConnected()) return true;
    return this.remotePlayer.isPaused;
  }

  getPlayerState() {
    if (!this.isConnected()) return null;
    return this.remotePlayer.playerState;
  }

  getVolume() {
    if (!this.isConnected()) return 1;
    return this.remotePlayer.volumeLevel;
  }

  isMuted() {
    if (!this.isConnected()) return false;
    return this.remotePlayer.isMuted;
  }

  getQueueItems() {
    if (!this.isConnected()) return [];
    
    const session = this.castContext.getCurrentSession();
    if (!session) return [];
    
    const mediaSession = session.getMediaSession();
    if (!mediaSession || !mediaSession.items) return [];
    
    return mediaSession.items.map((item, index) => ({
      id: index,
      title: item.media.metadata ? item.media.metadata.title || `Item ${index + 1}` : `Item ${index + 1}`,
      url: item.media.contentId
    }));
  }

  // Media control methods
  loadMedia(url, currentTime = 0, autoplay = true, customData = "") {
    if (!this.isConnected() || !url) return Promise.reject('Not connected or no URL provided');
    
    // Determine content type
    let contentType = 'video/mp4';
    if (url.toLowerCase().endsWith('.m3u8')) {
      contentType = 'application/x-mpegURL';
    } else if (url.toLowerCase().endsWith('.mpd')) {
      contentType = 'application/dash+xml';
    }
    
    const mediaInfo = new chrome.cast.media.MediaInfo(url, contentType);
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = "Casting URL";
    mediaInfo.metadata.subtitle = url;
    
    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.currentTime = currentTime;
    request.autoplay = autoplay;
    request.customData = customData;
    
    return this.castContext.getCurrentSession().loadMedia(request);
  }

  playOrPause() {
    if (!this.isConnected()) return;
    this.remotePlayerController.playOrPause();
  }

  play() {
    if (!this.isConnected() || !this.remotePlayer.isPaused) return;
    this.remotePlayerController.playOrPause();
  }

  pause() {
    if (!this.isConnected() || this.remotePlayer.isPaused) return;
    this.remotePlayerController.playOrPause();
  }

  stop() {
    if (!this.isConnected()) return;
    this.remotePlayerController.stop();
  }

  seek(time) {
    if (!this.isConnected()) return;
    this.remotePlayer.currentTime = time;
    this.remotePlayerController.seek();
  }

  setVolume(volumeLevel) {
    if (!this.isConnected()) return;
    this.remotePlayer.volumeLevel = Math.max(0, Math.min(1, volumeLevel));
    this.remotePlayerController.setVolumeLevel();
  }

  muteOrUnmute() {
    if (!this.isConnected()) return;
    this.remotePlayerController.muteOrUnmute();
  }

  mute() {
    if (!this.isConnected() || this.remotePlayer.isMuted) return;
    this.remotePlayerController.muteOrUnmute();
  }

  unmute() {
    if (!this.isConnected() || !this.remotePlayer.isMuted) return;
    this.remotePlayerController.muteOrUnmute();
  }

  requestSession() {
    if (!this.castContext) return Promise.reject('Cast context not initialized');
    return this.castContext.requestSession();
  }

  endCurrentSession(stopCasting = true) {
    if (!this.castContext) return Promise.reject('Cast context not initialized');
    return this.castContext.endCurrentSession(stopCasting);
  }

  sendCustomMessage(data) {
    const NAMESPACE = 'urn:x-cast:com.antiglitch.ccast.custom';
    if (
      typeof cast !== 'undefined' &&
      cast.framework &&
      this.castContext &&
      this.castContext.getCurrentSession()
    ) {
      const session = this.castContext.getCurrentSession();
      try {
        session.sendMessage(
          NAMESPACE,
          data,
          () => { console.log('Custom message sent:', data); },
          (err) => { console.error('Error sending custom message:', err); }
        );
      } catch (e) {
        console.error('Exception sending custom message:', e);
      }
    } else {
      alert('No cast session available.');
    }
  }
}

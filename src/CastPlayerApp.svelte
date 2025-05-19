<script>
  import { onMount, onDestroy } from 'svelte';

  // --- Constants (migrated from original) ---
  const LIVE_INDICATOR_BUFFER = 50;
  const PROGRESS_BAR_WIDTH = 700;
  const TIMER_STEP = 1000;
  const DEFAULT_VOLUME = 0.5;
  const FULL_VOLUME_HEIGHT = 100;
  const PLAYER_STATE = {
    IDLE: 'IDLE',
    BUFFERING: 'BUFFERING',
    LOADED: 'LOADED',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED'
  };

  // --- Reactive state ---
  let playerState = PLAYER_STATE.IDLE;
  let playerStateBeforeSwitch = null;
  let currentMediaTime = 0;
  let mediaDuration = -1;
  let currentMediaUrl = '';
  let isLiveContent = false;
  let liveSeekableRange = null;
  let fullscreen = false;
  let isMuted = false;
  let volumeLevel = DEFAULT_VOLUME * 100;
  let mediaInfo = null;
  let whenSkippable = null;
  let queueItems = [];
  
  // --- Non-reactive state (references) ---
  let remotePlayer = null;
  let remotePlayerController = null;
  let timer = null;
  let videoElement;
  let progressBar;
  let progressIndicator;
  let seekableWindow;
  let unseekableOverlay;
  let audioLevel;
  let castContext;

  // --- Helper functions ---
  function getMediaTimeString(timestamp) {
    if (timestamp == undefined || timestamp == null) {
      return null;
    }

    let isNegative = false;
    if (timestamp < 0) {
      isNegative = true;
      timestamp *= -1;
    }

    let hours = Math.floor(timestamp / 3600);
    let minutes = Math.floor((timestamp - (hours * 3600)) / 60);
    let seconds = Math.floor(timestamp - (hours * 3600) - (minutes * 60));

    if (hours < 10) hours = '0' + hours;
    if (minutes < 10) minutes = '0' + minutes;
    if (seconds < 10) seconds = '0' + seconds;

    return (isNegative ? '-' : '') + hours + ':' + minutes + ':' + seconds;
  }

  function getClockTimeString(timestamp) {
    if (!timestamp) return "0:00:00";

    let date = new Date(timestamp * 1000);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = ('0' + minutes).slice(-2);
    seconds = ('0' + seconds).slice(-2);
    return hours + ':' + minutes + ':' + seconds + ' ' + ampm;
  }

  // --- Cast initialization ---
  function initializeCastPlayer() {
    console.log('Initializing Cast player');
    
    if (!window.chrome || !window.chrome.cast || !window.cast) {
      console.error('Chrome Cast API not available');
      return;
    }

    const options = {
      receiverApplicationId: '67338B81',
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      androidReceiverCompatible: true
    };

    try {
      castContext = cast.framework.CastContext.getInstance();
      castContext.setOptions(options);

      remotePlayer = new cast.framework.RemotePlayer();
      remotePlayerController = new cast.framework.RemotePlayerController(remotePlayer);

      // Set up event listeners
      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        (e) => switchPlayer(e.value)
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
        (event) => {
          currentMediaTime = event.value;
          updateProgressBarByTimer();
        }
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.DURATION_CHANGED,
        (event) => {
          mediaDuration = event.value;
          updateProgressBarByTimer();
        }
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
        updatePlayerState
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED,
        () => {
          isMuted = remotePlayer.isMuted;
        }
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.VOLUME_LEVEL_CHANGED,
        () => {
          volumeLevel = Math.round(remotePlayer.volumeLevel * 100);
        }
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.MEDIA_INFO_CHANGED,
        handleMediaInfoChange
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.QUEUE_DATA_CHANGED,
        updateQueueList
      );

      remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.LIVE_SEEKABLE_RANGE_CHANGED,
        (event) => {
          liveSeekableRange = event.value;
          updateProgressBarByTimer();
        }
      );

      console.log('Cast initialization complete');
    } catch (error) {
      console.error('Error initializing Cast:', error);
    }
  }

  function handleMediaInfoChange() {
    console.log('MEDIA_INFO_CHANGED event fired');
    
    if (!castContext) return;
    
    const session = castContext.getCurrentSession();
    if (!session) {
      mediaInfo = null;
      isLiveContent = false;
      return;
    }

    const media = session.getMediaSession();
    if (!media || !media.media) {
      mediaInfo = null;
      isLiveContent = false;
      
      if (!media || media.playerState === chrome.cast.media.PlayerState.IDLE) {
        playerState = PLAYER_STATE.IDLE;
        stopProgressTimer();
      }
      return;
    }

    // Update mediaInfo and related properties
    mediaInfo = media.media;
    console.log('Updated mediaInfo:', JSON.stringify(mediaInfo));
    
    if (mediaInfo) {
      isLiveContent = (mediaInfo.streamType == chrome.cast.media.StreamType.LIVE);
      
      // Update URL if changed
      if (mediaInfo.contentId && currentMediaUrl !== mediaInfo.contentId) {
        console.log(`Updating currentMediaUrl to ${mediaInfo.contentId}`);
        currentMediaUrl = mediaInfo.contentId;
      }
      
      // Update duration
      mediaDuration = mediaInfo.duration || 0;
    }

    // Update player state based on media state
    if (media.playerState === chrome.cast.media.PlayerState.PLAYING) {
      playerState = PLAYER_STATE.PLAYING;
      currentMediaTime = media.currentTime || 0;
      startProgressTimer();
    } else if (media.playerState === chrome.cast.media.PlayerState.PAUSED) {
      playerState = PLAYER_STATE.PAUSED;
      currentMediaTime = media.currentTime || 0;
      stopProgressTimer();
    }
    
    updateQueueList();
  }

  function updatePlayerState() {
    if (!remotePlayer) return;
    
    const receiverPlayerState = remotePlayer.playerState;
    console.log('Remote PLAYER_STATE_CHANGED:', receiverPlayerState);

    if (receiverPlayerState === chrome.cast.media.PlayerState.PLAYING) {
      playerState = PLAYER_STATE.PLAYING;
      startProgressTimer();
      
      // Get current time from media session for accuracy
      let session = castContext?.getCurrentSession();
      if (session && session.getMediaSession()) {
        currentMediaTime = session.getMediaSession().currentTime || 0;
      }
    } else if (receiverPlayerState === chrome.cast.media.PlayerState.PAUSED) {
      playerState = PLAYER_STATE.PAUSED;
      stopProgressTimer();
      
      // Get current time even in paused state
      let session = castContext?.getCurrentSession();
      if (session && session.getMediaSession()) {
        currentMediaTime = session.getMediaSession().currentTime || 0;
      }
    } else if (receiverPlayerState === chrome.cast.media.PlayerState.IDLE) {
      playerState = PLAYER_STATE.IDLE;
      stopProgressTimer();
      
      // Check if we should clear media info
      let currentSession = castContext?.getCurrentSession();
      if (currentSession && currentSession.getMediaSession() && 
          !currentSession.getMediaSession().media) {
        mediaInfo = null;
        currentMediaUrl = '';
      }
    } else if (receiverPlayerState === chrome.cast.media.PlayerState.BUFFERING) {
      playerState = PLAYER_STATE.BUFFERING;
    }
  }

  // --- Player switching ---
  function switchPlayer(isConnected) {
    console.log('Switching player. Connected:', isConnected);
    playerStateBeforeSwitch = playerState;

    if (isConnected) {
      // Switch to remote player
      if (videoElement && !videoElement.paused) {
        videoElement.pause();
      }
      setupRemotePlayer();
    } else {
      // Switch to local player
      mediaInfo = null; 
      isLiveContent = false;
      setupLocalPlayer();
      
      // Resume local playback if we have a URL
      if (currentMediaUrl && playerState !== PLAYER_STATE.PLAYING && 
          playerState !== PLAYER_STATE.PAUSED) {
        play();
      }
    }
  }

  function setupLocalPlayer() {
    console.log('Setting up local player');
    
    // Setup video element event listeners
    if (videoElement) {
      videoElement.addEventListener('loadeddata', onMediaLoadedLocally);
      videoElement.addEventListener('error', handleLocalPlayerError);
      
      // Set initial volume
      videoElement.volume = DEFAULT_VOLUME;
      videoElement.muted = isMuted;
    }
    
    // Enable progress bar
    enableProgressBar(true);
    
    if (currentMediaTime > 0 && videoElement) {
      videoElement.currentTime = currentMediaTime;
    }
    
    updateProgressBarByTimer();
  }
  
  function setupRemotePlayer() {
    console.log('Setting up remote player');
    
    // Hide local video element
    if (videoElement) {
      videoElement.style.display = 'none';
    }
    
    if (remotePlayer && remotePlayer.isConnected) {
      // Initialize UI with remote player state
      isMuted = remotePlayer.isMuted;
      volumeLevel = remotePlayer.volumeLevel * 100;
      
      // If resuming a session, get existing state
      if (castContext && castContext.getCurrentSession().getSessionState() === 
          cast.framework.SessionState.SESSION_RESUMED) {
        console.log('Resuming existing session');
        // Fetch current media info
        handleMediaInfoChange();
      }
    }
  }

  function onMediaLoadedLocally() {
    console.log('Media loaded locally');
    if (videoElement) {
      videoElement.currentTime = currentMediaTime;
      mediaDuration = videoElement.duration;
      
      playerState = PLAYER_STATE.LOADED;
      play();
      startProgressTimer();
    }
  }
  
  function handleLocalPlayerError(e) {
    console.error('Local video error:', e);
    playerState = PLAYER_STATE.IDLE;
    stopProgressTimer();
  }

  // --- Media control functions ---
  function play() {
    console.log('Play requested. State:', playerState, 'URL:', currentMediaUrl);
    
    if (!currentMediaUrl) {
      console.warn('No media URL set.');
      return;
    }
    
    // If idle or media not loaded, load first
    if (playerState === PLAYER_STATE.IDLE || !isMediaLoaded(currentMediaUrl)) {
      console.log('Media not loaded or player idle, loading first');
      load(currentMediaUrl);
      return;
    }
    
    if (remotePlayer && remotePlayer.isConnected) {
      if (remotePlayer.isPaused) {
        remotePlayerController.playOrPause();
      }
    } else if (videoElement) {
      videoElement.play();
      videoElement.style.display = 'block';
    }
    
    playerState = PLAYER_STATE.PLAYING;
    startProgressTimer();
  }

  function pause() {
    console.log('Pause requested. State:', playerState);
    
    if (playerState !== PLAYER_STATE.PLAYING && playerState !== PLAYER_STATE.BUFFERING) {
      console.log('Not in a pausable state');
      return;
    }
    
    if (remotePlayer && remotePlayer.isConnected) {
      if (!remotePlayer.isPaused) {
        remotePlayerController.playOrPause();
      }
    } else if (videoElement) {
      videoElement.pause();
    }
    
    playerState = PLAYER_STATE.PAUSED;
    stopProgressTimer();
  }

  function stop() {
    console.log('Stop requested');
    
    if (remotePlayer && remotePlayer.isConnected) {
      remotePlayerController.stop();
    } else if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    }
    
    playerState = PLAYER_STATE.IDLE;
    stopProgressTimer();
    currentMediaTime = 0;
    updateProgressBarByTimer();
  }

  function load(url) {
    if (!url) {
      console.warn('No URL provided to load');
      return;
    }
    
    console.log('Loading URL:', url);
    playerState = PLAYER_STATE.BUFFERING;
    
    if (remotePlayer && remotePlayer.isConnected) {
      loadRemote(url);
    } else if (videoElement) {
      videoElement.src = url;
      videoElement.load();
    }
    
    currentMediaUrl = url;
  }
  
  function loadRemote(url) {
    // Determine content type
    let contentType = 'video/mp4';
    if (url.toLowerCase().endsWith('.m3u8')) {
      contentType = 'application/x-mpegURL';
    } else if (url.toLowerCase().endsWith('.mpd')) {
      contentType = 'application/dash+xml';
    }
    
    let mediaInfo = new chrome.cast.media.MediaInfo(url, contentType);
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = "Casting URL";
    mediaInfo.metadata.subtitle = url;
    
    let request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.currentTime = currentMediaTime;
    request.autoplay = true;
    
    // Default to non-fullscreen
    request.customData = { fullscreen: false };
    
    castContext.getCurrentSession().loadMedia(request)
      .then(() => {
        console.log('Remote media loaded successfully');
        playerState = PLAYER_STATE.PLAYING;
      })
      .catch((error) => {
        console.error('Remote media load error:', error);
        playerState = PLAYER_STATE.IDLE;
      });
  }
  
  function loadWithFullscreenOption(fullscreen) {
    if (!currentMediaUrl) {
      console.error('No media URL set');
      return;
    }
    
    if (remotePlayer && remotePlayer.isConnected) {
      // Content type determination
      let contentType = 'video/mp4';
      if (currentMediaUrl.toLowerCase().endsWith('.m3u8')) {
        contentType = 'application/x-mpegURL';
      } else if (currentMediaUrl.toLowerCase().endsWith('.mpd')) {
        contentType = 'application/dash+xml';
      }
      
      let mediaInfo = new chrome.cast.media.MediaInfo(currentMediaUrl, contentType);
      mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
      mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = "Casting URL" + (fullscreen ? " (Fullscreen)" : "");
      mediaInfo.metadata.subtitle = currentMediaUrl;
      
      let request = new chrome.cast.media.LoadRequest(mediaInfo);
      request.currentTime = currentMediaTime;
      request.autoplay = true;
      request.customData = { fullscreen };
      
      castContext.getCurrentSession().loadMedia(request)
        .then(() => {
          console.log('Media loaded with fullscreen:', fullscreen);
          playerState = PLAYER_STATE.PLAYING;
        })
        .catch((error) => {
          console.error('Error loading media with fullscreen:', error);
          playerState = PLAYER_STATE.IDLE;
        });
    } else {
      // Local playback if not connected
      play();
    }
  }

  function selectMedia(url) {
    console.log('Media URL selected:', url);
    if (!url) {
      console.error('No media URL provided');
      return;
    }
    
    const castSession = castContext?.getCurrentSession();
    let activeMediaSession = castSession ? castSession.getMediaSession() : null;
    
    const isPlayingOnReceiver = activeMediaSession && 
      (activeMediaSession.playerState === chrome.cast.media.PlayerState.PLAYING || 
       activeMediaSession.playerState === chrome.cast.media.PlayerState.BUFFERING);
    
    // Queue handling logic
    if (castSession && isPlayingOnReceiver) {
      // Check for existing queue
      const items = activeMediaSession.items;
      if (Array.isArray(items) && items.length > 1) {
        // Queue exists, add to it
        addToQueue(url);
        return;
      } else {
        // Convert single item to queue and add new item
        const currentMedia = activeMediaSession.media;
        if (!currentMedia) {
          // Just load if no current media
          currentMediaUrl = url;
          mediaInfo = null;
          load(url);
          return;
        }
        
        // Create queue with current + new item
        createQueueWithItems(currentMedia, url, activeMediaSession.currentTime);
        return;
      }
    }
    
    // Regular load (no queue)
    currentMediaUrl = url;
    mediaInfo = null;
    currentMediaTime = 0;
    playerState = PLAYER_STATE.IDLE;
    
    if (castSession) {
      load(url);
    } else {
      play();
    }
  }
  
  function addToQueue(url) {
    // Implementation of queue functionality
    console.log('Adding to queue:', url);
    // This would be implemented based on the chrome.cast.media.QueueItem API
  }
  
  function createQueueWithItems(currentMedia, newUrl, startTime) {
    // Implementation to convert single playing item to queue
    console.log('Creating queue with current item and new URL:', newUrl);
    // This would use the chrome.cast.media.QueueLoadRequest API
  }

  function isMediaLoaded(url) {
    if (remotePlayer && remotePlayer.isConnected) {
      const session = castContext?.getCurrentSession();
      if (!session) return false;
      
      const media = session.getMediaSession();
      if (!media || media.playerState === chrome.cast.media.PlayerState.IDLE) {
        return false;
      }
      
      return true;
    } else if (videoElement) {
      if (!url) {
        return (videoElement.src !== null && videoElement.src !== "");
      } else {
        return (videoElement.src === url);
      }
    }
    return false;
  }

  function seekTo(time) {
    if (remotePlayer && remotePlayer.isConnected) {
      remotePlayer.currentTime = time;
      remotePlayerController.seek();
    } else if (videoElement) {
      videoElement.currentTime = time;
    }
    currentMediaTime = time;
    updateProgressBarByTimer();
  }

  function setVolume(value) {
    volumeLevel = value;
    
    if (remotePlayer && remotePlayer.isConnected) {
      remotePlayer.volumeLevel = value / 100;
      remotePlayerController.setVolumeLevel();
    } else if (videoElement) {
      videoElement.volume = value / 100;
    }
  }

  function mute() {
    isMuted = true;
    
    if (remotePlayer && remotePlayer.isConnected) {
      if (!remotePlayer.isMuted) {
        remotePlayerController.muteOrUnmute();
      }
    } else if (videoElement) {
      videoElement.muted = true;
    }
  }

  function unMute() {
    isMuted = false;
    
    if (remotePlayer && remotePlayer.isConnected) {
      if (remotePlayer.isMuted) {
        remotePlayerController.muteOrUnmute();
      }
    } else if (videoElement) {
      videoElement.muted = false;
    }
  }

  // --- Progress and timers ---
  function startProgressTimer() {
    stopProgressTimer();
    
    timer = setInterval(() => {
      if (remotePlayer && remotePlayer.isConnected) {
        // Remote time updates come from events
      } else if (videoElement && !videoElement.paused && !videoElement.ended) {
        currentMediaTime = videoElement.currentTime;
        updateProgressBarByTimer();
      }
    }, TIMER_STEP);
  }

  function stopProgressTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function updateProgressBarByTimer() {
    if (!progressBar || !progressIndicator || !seekableWindow || !unseekableOverlay) {
      return;
    }
    
    // Get current time and duration
    let time = currentMediaTime || 0;
    let duration = mediaDuration || 0;
    
    // Adjust for live content
    let startTime = 0;
    if (isLiveContent && mediaInfo && mediaInfo.metadata && 
        typeof mediaInfo.metadata.sectionStartTimeInMedia === 'number') {
      startTime = mediaInfo.metadata.sectionStartTimeInMedia;
      time = Math.max(0, time - startTime);
      
      if (typeof mediaInfo.metadata.sectionDuration === 'number') {
        duration = mediaInfo.metadata.sectionDuration;
      }
    }
    
    // Clamp values
    if (duration <= 0) duration = 1;
    if (time < 0) time = 0;
    if (time > duration) time = duration;
    
    // Calculate progress position
    const percent = duration > 0 ? (time / duration) : 0;
    const px = Math.round(PROGRESS_BAR_WIDTH * percent);
    
    // Update DOM elements
    progressBar.style.width = px + 'px';
    progressIndicator.style.marginLeft = px + 'px';
    
    // Update seekable/unseekable for live content
    if (isLiveContent && liveSeekableRange) {
      const seekableDuration = liveSeekableRange.end - liveSeekableRange.start;
      const seekablePx = Math.round(PROGRESS_BAR_WIDTH * (seekableDuration / duration));
      seekableWindow.style.width = seekablePx + 'px';
      unseekableOverlay.style.width = (PROGRESS_BAR_WIDTH - seekablePx) + 'px';
    } else {
      seekableWindow.style.width = PROGRESS_BAR_WIDTH + 'px';
      unseekableOverlay.style.width = '0px';
    }
  }

  function enableProgressBar(enable) {
    if (!progressBar || !progressIndicator || !seekableWindow) return;
    
    if (enable) {
      progressBar.style.cursor = "pointer";
      seekableWindow.style.cursor = "pointer";
      progressIndicator.style.cursor = "pointer";
      progressIndicator.draggable = true;
    } else {
      progressBar.style.cursor = "default";
      seekableWindow.style.cursor = "default";
      progressIndicator.style.cursor = "default";
      progressIndicator.draggable = false;
    }
  }

  function handleProgressBarClick(event) {
    if (!progressBar) return;
    
    const rect = progressBar.parentElement.getBoundingClientRect();
    const clickPos = event.clientX - rect.left;
    const percent = clickPos / PROGRESS_BAR_WIDTH;
    
    // Calculate time based on percentage
    const duration = mediaDuration || 0;
    const newTime = duration * percent;
    
    seekTo(newTime);
  }

  function updateQueueList() {
    if (!castContext) return;
    
    const castSession = castContext.getCurrentSession();
    if (!castSession) {
      queueItems = [];
      return;
    }
    
    const mediaSession = castSession.getMediaSession();
    if (!mediaSession || !mediaSession.items) {
      queueItems = [];
      return;
    }
    
    queueItems = mediaSession.items.map((item, index) => ({
      id: index,
      title: item.media.metadata ? item.media.metadata.title || `Item ${index + 1}` : `Item ${index + 1}`,
      url: item.media.contentId
    }));
  }

  // --- Component lifecycle ---
  onMount(() => {
    console.log('CastPlayerApp mounted');
    
    // Set references to DOM elements
    if (!progressBar) progressBar = document.getElementById('progress');
    if (!progressIndicator) progressIndicator = document.getElementById('progress_indicator');
    if (!seekableWindow) seekableWindow = document.getElementById('seekable_window');
    if (!unseekableOverlay) unseekableOverlay = document.getElementById('unseekable_overlay');
    if (!audioLevel) audioLevel = document.getElementById('audio_bg_level');
    
    // Initialize Cast API when available
    window['__onGCastApiAvailable'] = function (isAvailable) {
      console.log('Cast API available:', isAvailable);
      if (isAvailable) {
        setTimeout(() => {
          initializeCastPlayer();
        }, 500);
      } else {
        console.error('Cast API is not available');
      }
    };
    
    // Set up local player
    setupLocalPlayer();
  });

  onDestroy(() => {
    stopProgressTimer();
    
    // Remove event listeners
    if (videoElement) {
      videoElement.removeEventListener('loadeddata', onMediaLoadedLocally);
      videoElement.removeEventListener('error', handleLocalPlayerError);
    }
    
    // Clean up references
    remotePlayer = null;
    remotePlayerController = null;
  });
</script>

<main>
  <div class="container">
    <header>
      <h1>Cast Video Player</h1>
      <div id="cast-button"></div>
    </header>
    
    <div class="media-input">
      <input bind:value={currentMediaUrl} placeholder="Enter media URL" />
      <button on:click={() => selectMedia(currentMediaUrl)}>Load</button>
    </div>

    <div class="player-container">
      <!-- Video Element -->
      <video 
        id="video_element" 
        bind:this={videoElement} 
        width="100%" 
        style="display: {remotePlayer && remotePlayer.isConnected ? 'none' : 'block'}"
      ></video>
      
      <!-- Placeholder for remote playback -->
      <div 
        id="remote-placeholder" 
        class="remote-placeholder"
        style="display: {remotePlayer && remotePlayer.isConnected ? 'block' : 'none'}"
      >
        <div id="video_image_overlay" class="overlay"></div>
        <img id="video_image" src="imagefiles/bunny.jpg" alt="Media thumbnail" />
        <div id="playerstate" class="playerstate">
          {#if remotePlayer && remotePlayer.isConnected}
            Casting to {castContext?.getCurrentSession()?.getCastDevice()?.friendlyName || 'Chromecast'}
          {/if}
        </div>
        <div id="playerstatebg" class="playerstatebg"></div>
      </div>
      
      <!-- Controls -->
      <div class="media-controls" id="media_control">
        <div class="transport-controls">
          <button on:click={play} disabled={playerState === PLAYER_STATE.PLAYING} id="play">
            Play
          </button>
          <button on:click={pause} disabled={playerState !== PLAYER_STATE.PLAYING} id="pause">
            Pause
          </button>
          <button on:click={stop} id="stop">Stop</button>
        </div>
        
        <!-- Progress bar -->
        <div class="progress-container">
          <div id="seekable_window" class="seekable_window" bind:this={seekableWindow} on:click={handleProgressBarClick}>
            <div id="progress" class="progress-bar" bind:this={progressBar}></div>
            <div id="progress_indicator" class="progress-indicator" bind:this={progressIndicator} draggable={true}></div>
            <div id="unseekable_overlay" class="unseekable-overlay" bind:this={unseekableOverlay}></div>
          </div>
          
          <div class="time-display">
            <span id="currentTime">{getMediaTimeString(currentMediaTime)}</span>
            <span>/</span>
            <span id="duration">{getMediaTimeString(mediaDuration)}</span>
          </div>
        </div>
        
        <!-- Volume controls -->
        <div class="volume-container">
          <button on:click={mute} class="volume-button" id="audio_on" style="display: {isMuted ? 'none' : 'inline-block'}">
            🔊
          </button>
          <button on:click={unMute} class="volume-button" id="audio_off" style="display: {isMuted ? 'inline-block' : 'none'}">
            🔇
          </button>
          
          <div id="audio_bg_level_container" class="volume-slider-container">
            <input 
              type="range" 
              min="0" 
              max="100" 
              bind:value={volumeLevel} 
              on:input={() => setVolume(volumeLevel)} 
              class="volume-slider"
            />
            <div id="audio_bg_level" class="volume-level" style="height: {volumeLevel}%"></div>
          </div>
        </div>
      </div>
      
      <!-- Media info -->
      <div class="media-info">
        <h3 id="media_title">
          {#if mediaInfo && mediaInfo.metadata && mediaInfo.metadata.title}
            {mediaInfo.metadata.title}
          {:else if currentMediaUrl}
            Playing URL
          {:else}
            No URL Loaded
          {/if}
        </h3>
        <p id="media_subtitle">
          {#if mediaInfo && mediaInfo.metadata && mediaInfo.metadata.subtitle}
            {mediaInfo.metadata.subtitle}
          {:else}
            {currentMediaUrl || "Please enter a media URL"}
          {/if}
        </p>
      </div>
      
      <!-- Live indicator -->
      {#if isLiveContent}
        <div id="live_indicator" class="live-indicator">LIVE</div>
      {/if}
    </div>
    
    <!-- Queue list -->
    {#if queueItems.length > 0}
      <div class="queue-container">
        <h3>Queue</h3>
        <ul id="queue_list">
          {#each queueItems as item}
            <li>{item.title}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</main>

<style>
  .container {
    font-family: 'Roboto', sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .media-input {
    display: flex;
    margin-bottom: 20px;
  }
  
  .media-input input {
    flex-grow: 1;
    padding: 8px;
    margin-right: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  .media-input button {
    padding: 8px 16px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .player-container {
    position: relative;
    margin-bottom: 20px;
    background-color: #000;
    color: white;
    border-radius: 8px;
    overflow: hidden;
  }
  
  video {
    width: 100%;
    display: block;
  }
  
  .remote-placeholder {
    position: relative;
    width: 100%;
    height: 450px;
    background-color: #111;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
  }
  
  .playerstate, .playerstatebg {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 5px 10px;
    background-color: rgba(0, 0, 0, 0.7);
    border-radius: 4px;
  }
  
  .media-controls {
    padding: 10px;
    background-color: #333;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }
  
  .transport-controls {
    display: flex;
    margin-bottom: 10px;
  }
  
  .transport-controls button {
    margin-right: 10px;
    padding: 8px 16px;
    background-color: #555;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .transport-controls button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .progress-container {
    margin-bottom: 10px;
  }
  
  .seekable_window {
    position: relative;
    width: 100%;
    height: 8px;
    background-color: #555;
    border-radius: 4px;
    margin-bottom: 5px;
    cursor: pointer;
  }
  
  .progress-bar {
    height: 100%;
    background-color: #4285f4;
    border-radius: 4px;
    width: 0;
  }
  
  .progress-indicator {
    position: absolute;
    top: -4px;
    width: 16px;
    height: 16px;
    background-color: white;
    border-radius: 50%;
    margin-left: 0;
    cursor: pointer;
  }
  
  .unseekable-overlay {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    background-color: rgba(255, 0, 0, 0.3);
    width: 0;
  }
  
  .time-display {
    display: flex;
    justify-content: space-between;
    color: #ccc;
    font-size: 14px;
  }
  
  .volume-container {
    display: flex;
    align-items: center;
  }
  
  .volume-button {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    margin-right: 10px;
  }
  
  .volume-slider-container {
    position: relative;
    width: 100px;
    height: 8px;
    background-color: #555;
    border-radius: 4px;
  }
  
  .volume-slider {
    width: 100%;
    opacity: 0;
    cursor: pointer;
  }
  
  .volume-level {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    background-color: #4285f4;
    border-radius: 4px;
  }
  
  .media-info {
    padding: 10px;
    background-color: #222;
    color: white;
  }
  
  .media-info h3 {
    margin: 0 0 5px 0;
    font-size: 18px;
  }
  
  .media-info p {
    margin: 0;
    font-size: 14px;
    color: #ccc;
    word-break: break-all;
  }
  
  .live-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 5px 10px;
    background-color: red;
    color: white;
    border-radius: 4px;
    font-weight: bold;
  }
  
  .queue-container {
    margin-top: 20px;
  }
  
  .queue-container h3 {
    margin-bottom: 10px;
  }
  
  .queue-container ul {
    list-style-type: none;
    padding: 0;
    margin: 0;
    background-color: #333;
    border-radius: 4px;
    overflow: hidden;
  }
  
  .queue-container li {
    padding: 10px;
    border-bottom: 1px solid #444;
    color: white;
  }
  
  .queue-container li:last-child {
    border-bottom: none;
  }
</style>

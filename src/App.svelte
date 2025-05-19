<script>
  import { onMount, onDestroy } from 'svelte';
  import castService from './services/castServiceInstance.js';
  import MediaPlayerService from './services/MediaPlayerService.js';
  import { formatTime, formatClockTime } from './utils/TimeUtils.js';
  import MediaControls from './components/MediaControls.svelte';

  // --- Constants ---
  const LIVE_INDICATOR_BUFFER = 50;
  const PROGRESS_BAR_WIDTH = 700;
  const TIMER_STEP = 1000;
  const DEFAULT_VOLUME = 0.5;
  const PLAYER_STATE = {
    IDLE: 'IDLE',
    BUFFERING: 'BUFFERING',
    LOADED: 'LOADED',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED'
  };

  // --- Video dimensions ---
  const VIDEO_WIDTH = 640;
  const VIDEO_HEIGHT = 360;

  // --- Reactive state ---
  let playerState = PLAYER_STATE.IDLE;
  let currentMediaTime = 0;
  let mediaDuration = -1;
  let currentMediaUrl = '';
  let newMediaUrl = '';
  let isLiveContent = false;
  let liveSeekableRange = null;
  let isMuted = false;
  let volumeLevel = DEFAULT_VOLUME;
  let mediaInfo = null;
  let queueItems = [];
  let currentQueueItemId = null; // To track the current playing item in the queue
  let urlToAddQueue = ''; // For the "Add to Queue" input
let isCasting = false;

  // --- Services ---
  let mediaPlayerService = new MediaPlayerService();
  
  // --- DOM References ---
  let videoElement;
  let castButtonContainer;
  
let fullscreen = false; // Track if the video is in fullscreen mode

  // --- Event handlers ---
  function handlePlay() {
    if (!currentMediaUrl) {
      console.warn('No media URL set.');
      return;
    }
    
    if (playerState === PLAYER_STATE.IDLE || !isMediaLoaded()) {
      console.log('Media not loaded or player idle, loading first');
      loadMedia();
      return;
    }
    
    if (castService.isConnected()) {
      castService.play();
    } else {
      mediaPlayerService.play();
    }
    
    playerState = PLAYER_STATE.PLAYING;
  }
  
  function handlePause() {
    if (playerState !== PLAYER_STATE.PLAYING && playerState !== PLAYER_STATE.BUFFERING) {
      return;
    }
    
    if (castService.isConnected()) {
      castService.pause();
    } else {
      mediaPlayerService.pause();
    }
    
    playerState = PLAYER_STATE.PAUSED;
  }
  
  function handleStop() {
    if (castService.isConnected()) {
      castService.stop();
    } else {
      mediaPlayerService.stop();
    }
    
    playerState = PLAYER_STATE.IDLE;
    currentMediaTime = 0;
  }
  
  function handleSeek(event) {
    const time = event.detail;
    
    if (castService.isConnected()) {
      // If seeking on a queue item, use queueSeekToTime
      // if (castService.isQueueActive() && currentQueueItemId !== null) {
      //   castService.queueSeekToTime(currentQueueItemId, time);
      // } else {
        castService.seek(time);
      // }
    } else {
      mediaPlayerService.seek(time);
    }
    
    currentMediaTime = time;
  }
  
  function handleVolumeChange(event) {
    volumeLevel = event.detail;
    
    if (castService.isConnected()) {
      castService.setVolume(volumeLevel);
    } else {
      mediaPlayerService.setVolume(volumeLevel);
    }
  }
  
  function handleMute() {
    isMuted = true;
    
    if (castService.isConnected()) {
      castService.mute();
    } else {
      mediaPlayerService.mute();
    }
  }
  
  function handleUnmute() {
    isMuted = false;
    
    if (castService.isConnected()) {
      castService.unmute();
    } else {
      mediaPlayerService.unmute();
    }
  }
  
  function handleFullscreen() {
    loadMediaWithFullscreen(true);
  }
  
  function selectMedia() {
    if (!newMediaUrl) {
      console.error('No media URL provided');
      return;
    }
    
    currentMediaTime = 0;
    playerState = PLAYER_STATE.IDLE;
    loadMedia();
  }
  
  // --- Media loading functions ---
  function loadMedia() {
    if (!newMediaUrl) return;
    
    playerState = PLAYER_STATE.BUFFERING;
    
    if (castService.isConnected()) {
      // Assuming castService.loadMedia handles creating/replacing a queue
      // with the currentMediaUrl as a single item.
      castService.loadMedia(newMediaUrl, 0)
        .then(() => {
          console.log('Remote media loaded/reloaded as queue successfully');
          playerState = PLAYER_STATE.PLAYING;
        })
        .catch((error) => {
          console.error('Remote media load error:', error);
          playerState = PLAYER_STATE.IDLE;
        });
    } else {
      mediaPlayerService.load(newMediaUrl);
      mediaPlayerService.play()
        .then(() => {
          playerState = PLAYER_STATE.PLAYING;
        })
        .catch(err => {
          console.error('Error playing local media:', err);
          playerState = PLAYER_STATE.IDLE;
        });
    }
  }
  
  function loadMediaWithFullscreen(fullscreen) {
    if (!currentMediaUrl || !castService.isConnected()) return;
    
    // Assuming castService.loadMedia handles queueing
    castService.loadMedia(currentMediaUrl, currentMediaTime, true)
      .then(() => {
        console.log('Media loaded into queue with fullscreen:', fullscreen);
        playerState = PLAYER_STATE.PLAYING;
      })
      .catch((error) => {
        console.error('Error loading media with fullscreen:', error);
        playerState = PLAYER_STATE.IDLE;
      });
  }
  
  function isMediaLoaded() {
    if (castService.isConnected()) {
      return castService.getMediaInfo() !== null;
    } else {
      return mediaPlayerService.isMediaLoaded(currentMediaUrl);
    }
  }
  
  // --- Cast connection handling ---
  function handleCastConnected(isConnected) {
    console.log('Cast connection changed:', isConnected);
    isCasting = isConnected;
    if (isConnected) {
      // Switching to cast device
      if (videoElement && !mediaPlayerService.isPaused()) {
        mediaPlayerService.pause();
      }
      
      // Update volume from local player to cast
      castService.setVolume(volumeLevel);
      fullscreen = castService.isFullscreen();

      // If we had media playing, transfer it to the cast device (as a queue)
      if (currentMediaUrl && (playerState === PLAYER_STATE.PLAYING || playerState === PLAYER_STATE.PAUSED)) {
        // Assuming castService.loadMedia correctly loads this as a new queue
        castService.loadMedia(currentMediaUrl, currentMediaTime, playerState === PLAYER_STATE.PLAYING);
      }
    } else {
      // Switching back to local player
      mediaInfo = null;
      isLiveContent = false;
      
      // If we had media casting, continue locally
      if (currentMediaUrl) {
        mediaPlayerService.load(currentMediaUrl);
        mediaPlayerService.seek(currentMediaTime);
        
        if (playerState === PLAYER_STATE.PLAYING) {
          mediaPlayerService.play();
        }
      }
    }
  }

  
  // --- Cast media info handling ---
  function handleCastMediaInfoChanged(newMediaInfo) {
    mediaInfo = newMediaInfo;
    currentQueueItemId = castService.remotePlayer?.mediaInfo?.currentItemId || null;
    
    if (mediaInfo) {
      isLiveContent = (mediaInfo.streamType == chrome.cast.media.StreamType.LIVE);
      
      // Update URL if changed
      if (mediaInfo.contentId && currentMediaUrl !== mediaInfo.contentId) {
        console.log(`Updating currentMediaUrl to ${mediaInfo.contentId}`);
        currentMediaUrl = mediaInfo.contentId;
      }
      
      // Update duration
      mediaDuration = mediaInfo.duration || 0;

      fullscreen = castService.isFullscreen();
    }
  }
  
  // --- Queue control handlers ---
  function handleQueueNext() {
    if (castService.isConnected()) {
      castService.queueNext();
    }
  }

  function handleQueuePrev() {
    if (castService.isConnected()) {
      castService.queuePrev();
    }
  }

  function handleQueueRemoveItem(itemId) {
    if (castService.isConnected() && itemId !== undefined) {
      castService.queueRemoveItem(itemId);
    } else {
      console.warn('Cannot remove item: not connected or itemId is undefined', itemId);
    }
  }

  function handleAddToQueue() {
    if (!castService.isConnected()) {
      console.warn('Cannot add to queue: Not connected to a cast device.');
      alert('Please connect to a Cast device first.');
      return;
    }
    if (!urlToAddQueue.trim()) {
      console.warn('Cannot add to queue: URL is empty.');
      alert('Please enter a media URL to add to the queue.');
      return;
    }

    // Check if media is already loaded on the cast device.
    // isMediaLoaded() internally checks castService.getMediaInfo() when connected.
    if (!isMediaLoaded()) { 
      // No media loaded on cast device, so treat "Add to Queue" as "Load & Play"
      // for this new URL. This will establish a new queue.
      currentMediaUrl = urlToAddQueue.trim(); // Set this as the primary URL to load
      currentMediaTime = 0; // Start new media from the beginning
      
      console.log(`No media currently loaded on cast device. Loading ${currentMediaUrl} as a new queue.`);
      // loadMedia() will set playerState to BUFFERING and call castService.loadMedia,
      // which is expected to create/replace the queue.
      loadMedia(); 

      urlToAddQueue = ''; // Clear the "add to queue" input
    } else {
      // Media is already loaded (queue active), so add the new item to the existing queue.
      // This assumes castService.addItemToQueue(url) exists and handles
      // creating MediaInfo, QueueItem, and calling mediaSession.queueInsertItems()
      castService.addItemToQueue(urlToAddQueue.trim())
        .then(() => {
          console.log(`Successfully requested to add ${urlToAddQueue} to queue.`);
          urlToAddQueue = ''; // Clear input after adding
        })
        .catch((error) => {
          console.error('Error adding item to queue via CastService:', error);
          alert(`Failed to add item to queue: ${error.message || error}`);
        });
    }
  }

  // --- Initialize services ---
  onMount(() => {
    console.log('App mounted');
    
    // Extract URL parameter with improved debugging
    const rawSearch = window.location.search;
    console.log('Raw query string:', rawSearch);
    
    const urlParams = new URLSearchParams(rawSearch);
    console.log('Parsed URLSearchParams:', [...urlParams.entries()]);
    
    const urlParam = urlParams.get('video');
    console.log('URL parameter raw value:', urlParam);
    
    if (urlParam) {
      newMediaUrl = urlParam;
      console.log('URL parameter detected and set to newMediaUrl:', newMediaUrl);
      
      // Auto-load the media if URL is provided in query string
      setTimeout(() => {
        console.log('Auto-loading media from URL parameter');
        selectMedia(); // This will load and play the media
      }, 1000); // Short delay to ensure everything is initialized
    }
    
    // Initialize media player service
    if (videoElement) {
      mediaPlayerService.initialize(videoElement);
      
      // Set up event listeners for local player
      mediaPlayerService.on('timeUpdate', (time) => {
        currentMediaTime = time;
      });
      
      mediaPlayerService.on('durationChange', (duration) => {
        mediaDuration = duration;
      });
      
      mediaPlayerService.on('play', () => {
        playerState = PLAYER_STATE.PLAYING;
      });
      
      mediaPlayerService.on('pause', () => {
        playerState = PLAYER_STATE.PAUSED;
      });
      
      mediaPlayerService.on('ended', () => {
        playerState = PLAYER_STATE.IDLE;
        currentMediaTime = 0;
      });
      
      mediaPlayerService.on('error', (error) => {
        console.error('Media player error:', error);
        playerState = PLAYER_STATE.IDLE;
      });
      
      mediaPlayerService.on('volumeChange', (data) => {
        volumeLevel = data.volume;
        isMuted = data.muted;
      });
    }
    
    // Set up the cast API
    window['__onGCastApiAvailable'] = function(isAvailable) {
      console.log('Cast API available:', isAvailable);
      if (isAvailable) {
        setTimeout(() => {
          const initialized = castService.initialize();
          
          if (initialized) {
            // Set up event listeners for cast
            castService.on('connectionChanged', handleCastConnected);
            castService.on('mediaInfoChanged', handleCastMediaInfoChanged);
            castService.on('timeChanged', (time) => {
              currentMediaTime = time;
            });
            castService.on('durationChanged', (duration) => {
              mediaDuration = duration;
            });
            castService.on('playerStateChanged', (state) => {
              // Map Chrome cast player states to our PLAYER_STATE
              if (state === chrome.cast.media.PlayerState.PLAYING) {
                playerState = PLAYER_STATE.PLAYING;
              } else if (state === chrome.cast.media.PlayerState.PAUSED) {
                playerState = PLAYER_STATE.PAUSED;
              } else if (state === chrome.cast.media.PlayerState.IDLE) {
                playerState = PLAYER_STATE.IDLE;
                // Potentially clear currentQueueItemId if queue ends or is empty
                if (queueItems.length === 0) {
                  currentQueueItemId = null;
                }
              } else if (state === chrome.cast.media.PlayerState.BUFFERING) {
                playerState = PLAYER_STATE.BUFFERING;
              }
              // Update currentQueueItemId when player state changes, as it might indicate item transition
              currentQueueItemId = castService.remotePlayer?.mediaInfo?.currentItemId || null;
            });
            castService.on('queueChanged', (items) => {
              queueItems = items || [];
              currentQueueItemId = castService.remotePlayer?.mediaInfo?.currentItemId || null;
            });
            castService.on('volumeChanged', (volume) => {
              volumeLevel = volume;
            });
            castService.on('isMutedChanged', (muted) => {
              isMuted = muted;
            });
            castService.on('liveSeekableRangeChanged', (range) => {
              liveSeekableRange = range;
            });
          }
        }, 500);
      } else {
        console.error('Cast API is not available');
      }
    };
    
    // Force the Google Cast button to be visible - this is crucial!
    if (castButtonContainer) {
      // Create a new observer to monitor changes to the cast button
      const observer = new MutationObserver(mutations => {
        // Find the google-cast-launcher if it exists
        const castButton = document.querySelector('google-cast-launcher');
        if (castButton) {
          // Make sure it's visible
          castButton.style.display = 'block';
          castButton.style.visibility = 'visible';
          castButton.style.opacity = '1';
          // The button should now be visible!
        }
      });
      
      // Start observing the container for changes
      observer.observe(castButtonContainer, { 
        childList: true, 
        subtree: true,
        attributes: true
      });
    }
  });

  onDestroy(() => {
    // Clean up any event listeners
  });

  let castButtonHtml = '';
  onMount(() => {
    // After DOM is ready, get the cast button HTML for slotting
    setTimeout(() => {
      const castBtn = castButtonContainer?.innerHTML;
      if (castBtn) castButtonHtml = castBtn;
    }, 0);
  });

  function handleFullscreenMsg() {
    if (castService.isConnected()) castService.sendCustomMessage({ fullscreen: true });
  }
  function handlePopupMsg() {
    if (castService.isConnected()) castService.sendCustomMessage({ popup: true });
  }
  function handleCloseMsg() {
    if (castService.isConnected()) castService.sendCustomMessage({ close: true });
  }
</script>

<main>
  <div class="container">
    <header>
      <h1>Cast Video Player</h1>
      <!-- Cast button container removed from here -->
    </header>
    
    <div class="media-input">
      <input bind:value={newMediaUrl} placeholder="Enter media URL to load/play" />
      <button on:click={selectMedia}>Load & Play</button>
    </div>

    <!-- Section to add items to queue, only visible when casting -->
    {#if isCasting}
      <div class="media-input add-to-queue-section">
        <input bind:value={urlToAddQueue} placeholder="Enter media URL to add to queue" />
        <button on:click={handleAddToQueue}>Add to Queue</button>
      </div>
    {/if}

    <div class="player-container">
      <!-- Only show video element when playing locally -->
      {#if !isCasting}
        <div class="local-video-container">
          <video 
            id="video_element" 
            bind:this={videoElement} 
            width={VIDEO_WIDTH}
            height={VIDEO_HEIGHT}
          ></video>
        </div>
      {:else}
        <!-- When casting, show a compact status screen instead of video -->
        <div class="casting-status">
          <h2>Casting to {castService.castContext?.getCurrentSession()?.getCastDevice()?.friendlyName || 'Chromecast'}</h2>
          {#if mediaInfo && mediaInfo.metadata && mediaInfo.metadata.title}
            <p>{mediaInfo.metadata.title}</p>
          {:else if currentMediaUrl}
            <p>Playing: {currentMediaUrl}</p>
          {/if}
          {#if playerState === PLAYER_STATE.PLAYING}
            <div class="status-icon">▶️ Playing</div>
          {:else if playerState === PLAYER_STATE.PAUSED}
            <div class="status-icon">⏸️ Paused</div>
          {:else if playerState === PLAYER_STATE.BUFFERING}
            <div class="status-icon">🔄 Buffering...</div>
          {/if}
        </div>
      {/if}
      
      <div class="media-controls-wrapper">
        <div class="media-controls-main"> 
          <MediaControls 
            currentTime={currentMediaTime}
            duration={mediaDuration}
            playerState={playerState}
            isMuted={isMuted}
            volume={volumeLevel}
            progressBarWidth={PROGRESS_BAR_WIDTH}
            castButtonSlot={castButtonHtml}
            fullscreen={fullscreen}
            on:play={handlePlay}
            on:pause={handlePause}
            on:stop={handleStop}
            on:seek={handleSeek}
            on:volume={handleVolumeChange}
            on:mute={handleMute}
            on:unmute={handleUnmute}
            on:fullscreen={handleFullscreen}
            on:fullscreenmsg={handleFullscreenMsg}
            on:popupmsg={handlePopupMsg}
            on:closemsg={handleCloseMsg}
          />
        </div>
        <div class="cast-button-container" bind:this={castButtonContainer} style="display:none">
          <google-cast-launcher id="cast-button"></google-cast-launcher>
        </div>
      </div>
      
      <!-- Media info is always shown -->
      <div class="media-info">
        <h3 id="media_title">
          {#if mediaInfo && mediaInfo.metadata && mediaInfo.metadata.title}
            {mediaInfo.metadata.title}
            {#if castService.isConnected && currentQueueItemId !== null && queueItems.length > 1}
              (Item {queueItems.findIndex(item => item.itemId === currentQueueItemId) + 1} of {queueItems.length})
            {/if}
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
        <div class="live-indicator">LIVE</div>
      {/if}
    </div>
    
    <!-- Queue list and controls - only show when casting -->
    {#if castService.isConnected && queueItems.length > 0}
      <div class="queue-container">
        <h3>Queue</h3>
        <div class="queue-controls">
          <button on:click={handleQueuePrev} disabled={!castService.canQueuePrev()}>Previous</button>
          <button on:click={handleQueueNext} disabled={!castService.canQueueNext()}>Next</button>
        </div>
        <ul id="queue_list">
          {#each queueItems as item (item.itemId)}
            <li class:current={item.itemId === currentQueueItemId}>
              <span>
                {item.media?.metadata?.title || item.media?.contentId || `Item ${item.itemId}`}
              </span>
              <button class="remove-item" on:click={() => handleQueueRemoveItem(item.itemId)}>Remove</button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</main>

<style>
  /* Keep all existing styles */
  /* ...existing code... */
  
  header {
    display: flex;
    justify-content: space-between; /* This will now just align the h1 if it's the only child */
    align-items: center;
    margin-bottom: 20px;
  }
  
  .cast-button-container {
    width: 36px; /* Adjust size as needed for your controls bar */
    height: 36px; /* Adjust size as needed */
    margin-left: 10px; /* Space between media controls and cast button */
    display: flex; /* Helps in centering the actual button if it's smaller */
    align-items: center;
    justify-content: center;
    /* Ensure it's visible if it was previously forced with !important */
    display: hidden !important; /* Hide it by default */
  }
  
  /* Make sure google-cast-launcher is visible and fills its container */
  :global(google-cast-launcher) {
    display: block !important; /* Or inline-block, check what works best */
    width: 100% !important;   /* Make it fill the new container size */
    height: 100% !important;  /* Make it fill the new container size */
    visibility: visible !important;
    opacity: 1 !important;
    /* If the cast button component uses CSS variables for size: */
    /* --cast-button-size: 24px; /* Example: adjust icon size if possible */
    /* --cast-icon-size: 24px; /* Another common variable name */
  }
  
  .media-input {
    display: flex;
    margin-bottom: 20px;
  }

  .add-to-queue-section {
    /* Optional: Add some specific styling if needed, e.g., different margin */
    margin-top: 10px; 
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
    background-color: #000; /* Player container background */
    color: white;
    border-radius: 8px;
    overflow: hidden;
  }

  .media-controls-wrapper {
    display: flex;
    align-items: center;
    padding: 5px 10px; /* Add padding around controls and button */
    /* background-color: rgba(0, 0, 0, 0.5); /* Optional: if MediaControls doesn't have its own bg */
  }

  .media-controls-main {
    flex-grow: 1; /* Allows this container to take up available space */
    min-width: 0; /* Important for flex items that might otherwise overflow */
  }
  
  .local-video-container {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #000;
    width: 100%;
  }
  
  video {
    display: block;
  }
  
  .casting-status {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 200px;
    background-color: #111;
    padding: 20px;
    text-align: center;
  }
  
  .casting-status h2 {
    margin: 0 0 10px 0;
    color: #4285f4;
  }
  
  .casting-status p {
    margin: 5px 0;
    color: #ccc;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .status-icon {
    margin-top: 15px;
    font-size: 18px;
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

  .queue-controls {
    margin-bottom: 10px;
  }

  .queue-controls button {
    padding: 8px 12px;
    margin-right: 10px;
    background-color: #555;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .queue-controls button:disabled {
    background-color: #333;
    cursor: not-allowed;
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
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .queue-container li.current {
    background-color: #4a4a4a;
    font-weight: bold;
  }

  .queue-container li .remove-item {
    padding: 5px 10px;
    background-color: #e60000;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 10px;
  }

  .queue-container li .remove-item:hover {
    background-color: #c00000;
  }
  
  .queue-container li:last-child {
    border-bottom: none;
  }
</style>

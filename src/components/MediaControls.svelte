<script>
  import { createEventDispatcher } from 'svelte';
  import { formatTime } from '../utils/TimeUtils.js';
  import castService from '../services/castServiceInstance.js';

  // Props
  export let currentTime = 0;
  export let duration = 0;
  export let playerState = 'IDLE';
  export let isMuted = false;
  export let volume = 0.5;
  export let progressBarWidth = 700;
  export let castButtonSlot = null; // New prop for cast button slot
  export let fullscreen = false;

  // Local state
  let progress;
  let progressIndicator;
  let seekableWindow;
  let unseekableOverlay;

  $: isCasting = castService.isConnected;


  const dispatch = createEventDispatcher();

  $: progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  $: volumePercentage = volume * 100;

  function handleProgressBarClick(event) {
    if (!seekableWindow) return;
    
    const rect = seekableWindow.getBoundingClientRect();
    const clickPos = event.clientX - rect.left;
    const percent = clickPos / rect.width;
    
    const newTime = duration * percent;
    dispatch('seek', newTime);
  }

  function handlePlay() {
    dispatch('play');
  }

  function handlePause() {
    dispatch('pause');
  }

  function handleStop() {
    dispatch('stop');
  }

  function handleMute() {
    dispatch('mute');
  }

  function handleUnmute() {
    dispatch('unmute');
  }

  function handleVolumeChange(event) {
    dispatch('volume', event.target.value / 100);
  }

  function handleFullscreen() {
    dispatch('fullscreen');
  }

  function handleFullscreenMsg() {
    dispatch('fullscreenmsg');
  }
  function handlePopupMsg() {
    dispatch('popupmsg');
  }
  function handleCloseMsg() {
    dispatch('closemsg');
  }
</script>

<div class="media-controls">
  <div class="transport-controls">
    <button on:click={handlePlay} disabled={playerState === 'PLAYING'} class="control-button">
      <span class="icon">▶</span>
      <span class="label">Play</span>
    </button>
    <button on:click={handlePause} disabled={playerState !== 'PLAYING'} class="control-button">
      <span class="icon">⏸</span>
      <span class="label">Pause</span>
    </button>
    <button on:click={handleStop} class="control-button">
      <span class="icon">⏹</span>
      <span class="label">Stop</span>
    </button>

 
<div class="left-align"> 
    {#if isCasting}
         {#if !fullscreen}
      <button on:click={handleFullscreenMsg} class="control-button">
        <span class="icon">⛶</span>
        <span class="label">Fullscreen</span>
      </button>
    {:else}
      <button on:click={handlePopupMsg} class="control-button">
        <span class="icon">⛶</span>
        <span class="label">Popup</span>
      </button>
      
    {/if}
      {#if castButtonSlot}
         <div class="cast-button-container">{@html castButtonSlot}</div>
      {/if}
    {/if}
</div>       
  </div>
  <div class="progress-container">
    <div class="seekable-window" bind:this={seekableWindow} on:click={handleProgressBarClick}>
      <div class="progress-bar" bind:this={progress} style="width: {progressPercentage}%"></div>
      <div class="progress-indicator" bind:this={progressIndicator} style="left: {progressPercentage}%"></div>
      <div class="unseekable-overlay" bind:this={unseekableOverlay}></div>
    </div>
    
    <div class="time-display">
      <span class="current-time">{formatTime(currentTime)}</span>
      <span class="separator">/</span>
      <span class="duration">{formatTime(duration)}</span>
    </div>
  </div>
  
  <div class="volume-container">
    <button on:click={handleMute} class="volume-button" style="display: {isMuted ? 'none' : 'inline-block'}">
      <span class="icon">🔊</span>
    </button>
    <button on:click={handleUnmute} class="volume-button" style="display: {isMuted ? 'inline-block' : 'none'}">
      <span class="icon">🔇</span>
    </button>
    
    <div class="volume-slider-container">
      <input 
        type="range" 
        min="0" 
        max="100" 
        value={volumePercentage} 
        on:input={handleVolumeChange} 
        class="volume-slider"
      />
      <div class="volume-level" style="height: {volumePercentage}%"></div>
    </div>
  </div>
</div>

<style>
  .media-controls {
    padding: 10px;
    background-color: #333;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
    color: white;
  }
  
  .transport-controls {
    display: flex;
    margin-bottom: 10px;
  }
  
  .control-button {
    margin-right: 10px;
    padding: 8px 16px;
    background-color: #555;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    min-width: 40px;
  }
  
  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .icon {
    margin-right: 5px;
  }
  
  .progress-container {
    margin-bottom: 10px;
  }
  
  .seekable-window {
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
  }
  
  .progress-indicator {
    position: absolute;
    top: -4px;
    width: 16px;
    height: 16px;
    background-color: white;
    border-radius: 50%;
    margin-left: -8px; /* Center the indicator */
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
    justify-content: flex-end;
    color: #ccc;
    font-size: 14px;
  }
  
  .separator {
    margin: 0 5px;
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
    opacity: 0.7;
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
  
  .left-align {
    margin-left: auto;
    display: flex;
    align-items: center;
  }

    .cast-button-container {
    width: 36px; /* Adjust size as needed for your controls bar */
    height: 36px; /* Adjust size as needed */
    margin-left: 10px; /* Space between media controls and cast button */
    display: flex; /* Helps in centering the actual button if it's smaller */
    align-items: center;
    justify-content: center;
    /* Ensure it's visible if it was previously forced with !important */
    display: flex !important; 
  }
</style>

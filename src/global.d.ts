// Type declarations for Google Cast SDK
declare namespace chrome {
  namespace cast {
    const VERSION: string;
    const isAvailable: boolean;
    
    enum AutoJoinPolicy {
      ORIGIN_SCOPED = 'origin_scoped',
      PAGE_SCOPED = 'page_scoped',
      TAB_AND_ORIGIN_SCOPED = 'tab_and_origin_scoped'
    }
    
    enum ErrorCode {
      API_NOT_INITIALIZED = 'api_not_initialized',
      CANCEL = 'cancel',
      CHANNEL_ERROR = 'channel_error',
      EXTENSION_MISSING = 'extension_missing',
      INVALID_PARAMETER = 'invalid_parameter',
      RECEIVER_UNAVAILABLE = 'receiver_unavailable',
      SESSION_ERROR = 'session_error',
      TIMEOUT = 'timeout'
    }
    
    // Add more type definitions as needed...
    
    namespace media {
      // Media namespace type definitions...
      const DEFAULT_MEDIA_RECEIVER_APP_ID: string;
      enum StreamType { BUFFERED, LIVE }
      enum PlayerState { IDLE, PLAYING, PAUSED, BUFFERING }
      
      class MediaInfo {
        constructor(contentId: string, contentType: string);
        // Properties and methods...
      }
      
      class GenericMediaMetadata {
        // Properties...
      }
      
      class LoadRequest {
        constructor(mediaInfo: MediaInfo);
        // Properties...
      }
    }
    
    namespace framework {
      class CastContext {
        static getInstance(): CastContext;
        setOptions(options: any): void;
        getCurrentSession(): CastSession;
        // Other methods...
      }
      
      class CastSession {
        loadMedia(request: chrome.cast.media.LoadRequest): Promise<void>;
        getMediaSession(): chrome.cast.media.MediaSession;
        getCastDevice(): any;
        // Other methods...
      }
      
      class RemotePlayer {
        // Properties and methods...
      }
      
      class RemotePlayerController {
        constructor(player: RemotePlayer);
        addEventListener(eventType: string, listener: Function): void;
        // Other methods...
      }
      
      enum RemotePlayerEventType {
        IS_CONNECTED_CHANGED,
        CURRENT_TIME_CHANGED,
        DURATION_CHANGED,
        PLAYER_STATE_CHANGED,
        IS_MUTED_CHANGED,
        VOLUME_LEVEL_CHANGED,
        MEDIA_INFO_CHANGED,
        QUEUE_DATA_CHANGED,
        LIVE_SEEKABLE_RANGE_CHANGED
        // Other event types...
      }
      
      enum SessionState {
        SESSION_RESUMED
        // Other states...
      }
    }
  }
}

// Declare the global cast variable
declare const cast: {
  framework: {
    CastContext: typeof chrome.cast.framework.CastContext;
    RemotePlayer: typeof chrome.cast.framework.RemotePlayer;
    RemotePlayerController: typeof chrome.cast.framework.RemotePlayerController;
    RemotePlayerEventType: typeof chrome.cast.framework.RemotePlayerEventType;
    SessionState: typeof chrome.cast.framework.SessionState;
  }
};

// Declare the callback function that's set on the window object
interface Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
}

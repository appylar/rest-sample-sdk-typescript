/**
 * =========================================================
 * Copyright (c) 2022 Appylar
 * =========================================================
 */

/**
 * Banner position enum
 */
export enum BannerPosition {
  BOTTOM,
  TOP,
}

export type AdType = 'banner' | 'interstitial'
export type Orientation = 'landscape' | 'portrait'

export interface ShowAdOptions {
  position: BannerPosition
  placement?: string
}

interface Size {
  width: number
  height: number
}

export type ParameterKey = 'banner_height' | 'age_restriction'

export interface AdEventInterstitialClosed {
  name: 'interstitial-closed'
}

export interface AdEventBannerHidden {
  name: 'banner-hidden'
}

export type AdEvent = AdEventBannerHidden | AdEventInterstitialClosed
export type AdEventListener = (event: AdEvent) => void

export interface RendererImpl {
  getScreenSize: () => Size
  getOrientation: () => Orientation
  showAd: (ad: AdResponseItem, opts?: ShowAdOptions) => void
  hideBanner: () => void
  addEventListener: (callback: AdEventListener) => void
}

/**
 * Events
 */
export interface EventInitialized {
  name: 'initialized'
}
export interface EventError {
  name: 'error'
  error: unknown
}
export interface EventNoAd {
  name: 'no-ad'
}
export interface EventAdShown {
  name: 'ad-shown'
  height?: number
  adType: AdType
}
export type Event =
  | EventError
  | EventAdShown
  | EventNoAd
  | EventInitialized
  | AdEvent
export type EventListener = (event: Event) => void

/**
 * General error responses
 */
export type ERROR_RATE_LIMITED = 'err_rate_limited'
export type ERROR_UNAUTHORIZED = 'err_unauthorized'
export type ERROR_INVALID_DATA = 'err_invalid_data'
export type ERROR_INTERNAL_SERVER_ERROR = 'err_internal_server_error'
export type ERROR_CODES =
  | ERROR_RATE_LIMITED
  | ERROR_UNAUTHORIZED
  | ERROR_INVALID_DATA
  | ERROR_INTERNAL_SERVER_ERROR
export interface ErrorResponseRateLimited {
  error: ERROR_RATE_LIMITED
  wait: number
}
export interface ErrorResponseUnauthorized {
  error: ERROR_UNAUTHORIZED
}
export interface ErrorResponseInvalidData {
  error: ERROR_INVALID_DATA
}
export interface ErrorResponseInternalServerError {
  error: ERROR_INTERNAL_SERVER_ERROR
}
export type ErrorResponse =
  | ErrorResponseRateLimited
  | ErrorResponseUnauthorized
  | ErrorResponseInvalidData
  | ErrorResponseInternalServerError

/**
 * Create session request and response
 */
export interface CreateSessionRequestData {
  app_key: string
  app_id: string
  width: number
  height: number
  density: number
  language: string
  country: string
  test_mode: boolean
}

export interface CreateSessionResponse {
  session_token: string
  buffer_limits: {
    min: number
  }
  /** The number of seconds to show a banner ad before switching to a new one */
  rotation_interval: number
}

/**
 * Get ads request and response
 */
export interface GetAdsRequestData {
  combinations: Record<Orientation, AdType[]>
  extra_parameters?: Record<string, string[]>
}

export interface GetAdsResponse {
  result: AdResponseItem[]
}

export interface AdResponseItem {
  ad: {
    orientation: Orientation
    type: AdType
    width: number
    height: number
  }
  url: string
  expires_at: string
}

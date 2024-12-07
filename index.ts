/**
 * =========================================================
 * Copyright (c) 2022 Appylar
 * =========================================================
 */
import { AdBuffer } from './ad-buffer'
import {
  AdType,
  CreateSessionRequestData,
  CreateSessionResponse,
  ErrorResponse,
  Event,
  EventListener,
  GetAdsRequestData,
  GetAdsResponse,
  Orientation,
  ParameterKey,
  RendererImpl,
  ShowAdOptions,
} from './interfaces'
import { WebRenderer } from './renderers/web'

const API_URL_CREATE_SESSION = 'https://www.appylar.com/api/v1/session/'
const API_URL_GET_ADS = 'https://www.appylar.com/api/v1/content/'

interface QueuedRequest {
  path: string
  body: Object
  timerId: ReturnType<typeof setTimeout>
}

interface RequestOptions {
  rejectOnUnauthorized: boolean
}

class RetryError extends Error {
  public waitTime: number
  constructor(waitTime: number) {
    super()
    this.waitTime = waitTime
  }
}

class Sdk {
  /** Array of callbacks to notify on events */
  private listeners: EventListener[] = []
  /** Internal ad buffer */
  private buffer: AdBuffer
  /** Session token used by the api when making authorized calls */
  private sessionToken: string | null = null
  /** The minimum number of ads required in the buffer before trying to refill automatically */
  private bufferMinLimit: number = 0
  /** Queue of requests in case of retries */
  private requestQueue: Record<string, QueuedRequest[]> = {}
  /** App key used to initialize the sdk */
  private appKey = '<YOUR_APP_KEY>'
  /** Number of seconds before showing a new banner when auto rotation is enabled */
  private rotationInterval = 0
  /** If banners should be switched automatically by a timer when shown */
  private autoRotateBanner = true
  /** Timer id for banner rotation timer */
  private bannerRotateTimerId: ReturnType<typeof setTimeout> | null = null
  /** The current ad type being shown */
  private currentAdType?: AdType
  /** The current show options for the ad being shown */
  private currentAdOpts?: ShowAdOptions
  /** Optional extra parameters sent when getting new ads */
  private parameters: Record<string, string[]> = {}
  /** The ad types requested in the init method */
  private adTypes: AdType[] = []
  /** The orientations requested in the init method */
  private orientations: Orientation[] = []
  /** Number of errors left that we can report */
  private errorsLeft = 3

  constructor(private readonly renderer: RendererImpl) {
    this.buffer = new AdBuffer()
    console.log('Add event listener for renderer')
    this.renderer.addEventListener((event) => {
      console.log('Ad event triggered', event)
      this.triggerEvent(event)
    })

    setInterval(() => this.bufferNewAdsIfNeeded(), 10000)
  }

  private triggerEvent(event: Event) {
    console.info('Triggering event', { event })
    this.listeners.forEach((listener) => listener(event))
  }

  private assertRequeustQueueForPath(path: string) {
    if (!(path in this.requestQueue)) {
      this.requestQueue[path] = []
    }
  }

  private async request<T>(
    path: string,
    body: Object,
    opts?: RequestOptions,
  ): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-type': 'application/json',
      }

      // Set authorization header if we have a session token
      if (this.sessionToken) {
        headers['Authorization'] = `Bearer ${this.sessionToken}`
      }

      // Perform request
      console.info('Request', { path, body })
      try {
        const response = await fetch(path, {
          method: 'post',
          credentials: 'same-origin',
          headers,
          body: JSON.stringify(body),
        })

        // Check if we received an error
        const data = await response.json()
        if ('error' in data) {
          console.error('Error response received')
          const errorResponse = data as ErrorResponse
          switch (errorResponse.error) {
            case 'err_internal_server_error':
            case 'err_rate_limited':
              // These error will be retried
              const waitTime =
                errorResponse.error === 'err_rate_limited'
                  ? errorResponse.wait
                  : 60
              throw new RetryError(waitTime)
            case 'err_unauthorized':
              // In the case of requesting ads we want to reject the promise so we can reinitialize, otherwise this
              // error will fall through and be notified to the developer (wrong credentials)
              if (opts?.rejectOnUnauthorized) {
                reject(errorResponse)
                return
              }
            case 'err_invalid_data':
              // Other errors should be propagated to the user
              this.triggerEvent({
                name: 'error',
                error: errorResponse.error,
              })
              break
          }
        } else if (!response.ok) {
          // Some other error
          throw new Error()
        } else {
          resolve(data as T)
        }
      } catch (e) {
        const waitTime = e instanceof RetryError ? e.waitTime : 60
        // Rate limiting should be hidden from the user so we silently put this request in a queue and retry it later
        console.error(
          `Request failed, wait ${waitTime} seconds before trying again`,
        )
        this.assertRequeustQueueForPath(path)

        // Clear old pending requests for same endpoint
        this.requestQueue[path].forEach((queuedRequest) => {
          console.log(`Removing timer with id ${queuedRequest.timerId}`)
          clearTimeout(queuedRequest.timerId)
        })
        this.requestQueue[path] = []

        // We put this request in a queue so it can be resolved later
        const _this = this
        const timerId = setTimeout(
          async () => resolve(await _this.request<T>(path, body)),
          (waitTime + 5) * 1000, // We add a few seconds to the wait time to make sure we don't accidentally hit the limit again
        )
        console.log('Adding timer', { timerId })
        this.requestQueue[path].push({
          path,
          body,
          timerId,
        })
      }
    })
  }

  private bufferNewAdsIfNeeded(
    orientations?: Orientation[],
    adTypes?: AdType[],
  ) {
    try {
      let needAnyMore = false
      const combinations: Partial<Record<Orientation, AdType[]>> = {}
      const neededOrientations = orientations ?? this.orientations
      const neededAdTypes = adTypes ?? this.adTypes
      neededOrientations.forEach((orientation) => {
        neededAdTypes.forEach((adType) => {
          const needMore =
            this.buffer.count(orientation, adType) < this.bufferMinLimit
          if (needMore) {
            // Add orientation and ad type to combinations
            if (!(orientation in combinations)) {
              combinations[orientation] = [adType]
            } else {
              // @ts-ignore
              combinations[orientation].push(adType)
            }
            needAnyMore = true
          }
        })
      })
      if (needAnyMore) {
        // We only buffer ads for this ad type
        this.requestAds(combinations)
      }
    } catch (e) {
      console.error(e)
    }
  }

  /**
   * Request new ads to fill buffer with.
   *
   * @param orientations The orientations to get ads for
   * @param adTypes The ad types to request new ads for
   */
  private async requestAds(
    combinations: Partial<Record<Orientation, AdType[]>>,
  ) {
    try {
      // Perform api request to create session
      const data = await this.request<GetAdsResponse>(
        API_URL_GET_ADS,
        {
          combinations,
          extra_parameters: this.parameters,
        } as GetAdsRequestData,
        { rejectOnUnauthorized: true },
      )

      // Add all ads to the buffer
      this.buffer.addAll(data.result)
    } catch (error) {
      // @ts-ignore
      if (error?.error === 'err_unauthorized') {
        // Session expired so we need to renew it
        await this.init(this.appKey, this.adTypes, this.orientations)
        // @ts-ignore
      } else if (error?.error) {
        console.error('Error when requesting new ads', { error })
        this.triggerEvent({
          name: 'error',
          error,
        })
      }
    }
  }

  /**
   * Add a new event listener that will be notified of all events.
   *
   * @param callback The event listener
   */
  addEventListener(callback: EventListener) {
    this.listeners.push(callback)
  }

  /**
   * Initialize the SDK.
   *
   * @param appKey The app key for the app that the sdk is running in.
   * @param adTypes The ad types that is used by the app.
   */
  async init(appKey: string, adTypes: AdType[], orientations: Orientation[]) {
    // Prepare data
    this.appKey = appKey
    this.sessionToken = null
    this.buffer = new AdBuffer()
    this.adTypes = adTypes
    this.orientations = orientations
    const size = this.renderer.getScreenSize()

    try {
      // Perform api request to create session
      const data = await this.request<CreateSessionResponse>(
        API_URL_CREATE_SESSION,
        {
          app_key: appKey,
          orientations,
          width: size.width,
          height: size.height,
          density: parseFloat($('#id_density').val() ?? '1'),

          // Example data we get from a debug form. In the real SDK this data must be fetched from real sources!
          app_id: $('#id_app_id').val(),
          language: $('#id_language').val(),
          country: $('#id_country').val(),
          test_mode: $('#id_test_mode').val() === '1',
        } as CreateSessionRequestData,
      )

      // Save session data
      this.sessionToken = data.session_token
      this.bufferMinLimit = data.buffer_limits.min
      this.rotationInterval = data.rotation_interval

      // Prepare ad buffer
      this.buffer = new AdBuffer()

      // notify
      this.triggerEvent({
        name: 'initialized',
      })

      // ...and start filling buffer
      const combinations: Record<string, AdType[]> = orientations.reduce(
        (total, item) => ({ ...total, [item]: adTypes }),
        {},
      )
      this.requestAds(combinations)
    } catch (error) {
      console.error('Error when initializing', { error })
      this.triggerEvent({
        name: 'error',
        error,
      })
    }
  }

  /**
   * Check if there is an ad in the buffer for the given format.
   *
   * @param adType The ad type to check
   * @returns True if the buffer contains at least one ad for the given format, false otherwise.
   */
  canShowAd(adType: AdType) {
    const orientation = this.renderer.getOrientation()
    return this.buffer.count(orientation, adType) > 0
  }

  /**
   * Show and ad from the internal buffer (if one exists). Triggers the 'ad-shown' event
   * if an ad existed, otherwise the 'no-ad' event is triggered.
   *
   * @param adType The ad type to show
   * @param opts Options
   * @returns void
   */
  showAd(adType: AdType, opts?: ShowAdOptions) {
    try {
      // Check if ad type is valid given the ones we requested
      if (!this.adTypes.includes(adType)) {
        this.triggerEvent({
          name: 'error',
          error: new Error('Invalid ad type'),
        })
        return false
      }

      const orientation = this.renderer.getOrientation()

      // Check if we have an ad or not
      const nextAd = this.buffer.get(orientation, adType)

      // Check if we should buffer more ads
      this.bufferNewAdsIfNeeded([orientation], [adType])

      // Do we have an ad to show?
      if (!nextAd) {
        console.info('No ads to show')
        this.triggerEvent({
          name: 'no-ad',
        })
        return false
      }

      // Save parameters so we can use them later to rotate the ad when if needed
      this.currentAdType = adType
      this.currentAdOpts = opts

      // Delegate to renderer to actually output something
      console.debug('Showing ad', { nextAd, opts })
      this.renderer.showAd(nextAd, opts)

      // Notify event listeners about the ad being shown
      this.triggerEvent({
        name: 'ad-shown',
        adType,
        height: nextAd.ad.height,
      })

      // Clear old timer (if any)
      this.stopBannerRotation()

      // Check if we should setup auto rotation of banners
      if (adType === 'banner' && this.autoRotateBanner) {
        // Setup new timer and show new banner with same arguments
        this.startBannerRotation()
      }

      return true
    } catch (e) {
      console.error(e)
    }
    return false
  }

  private stopBannerRotation() {
    if (this.bannerRotateTimerId) clearInterval(this.bannerRotateTimerId)
  }

  private startBannerRotation() {
    if (this.currentAdType === 'banner' && this.autoRotateBanner) {
      this.bannerRotateTimerId = setInterval(() => {
        this.showAd(this.currentAdType!, this.currentAdOpts)
      }, this.rotationInterval * 1000)
    }
  }

  /**
   * Hide banner if it is showing.
   */
  hideBanner() {
    try {
      this.renderer.hideBanner()
    } catch (e) {
      console.error(e)
    }
  }

  /**
   * Set extra parameters used when getting ads. This can include things like age restrictions for example.
   * @param parameters Extra parameters
   */
  setParameters(parameters: Record<ParameterKey, string[]>) {
    this.parameters = parameters

    // Empty the buffer since the ads in there might not be valid anymore
    this.buffer.empty()

    // And refill buffer with new ads
    this.bufferNewAdsIfNeeded()
  }
}

/**
 * This snippet allows debugging in plain browser
 */

// @ts-ignore
window.Sdk = Sdk
// @ts-ignore
window.WebRenderer = WebRenderer

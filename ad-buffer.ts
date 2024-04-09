/**
 * =========================================================
 * Copyright (c) 2022 Appylar
 * =========================================================
 */
import { AdResponseItem, AdType, Orientation } from './interfaces'

/**
 * The ad buffer stores all ads in a key-value dictionary. The key is the format
 * and the value is an array of ads.
 */
export class AdBuffer {
  /**
   * The internal buffer. The buffer is organised as a key-value store
   * with 2 levels. The key is the orientation and ad type and the value
   * is an array of ads for that orientation and ad type.
   */
  private _buffer: Record<string, Record<string, AdResponseItem[]>> = {}

  constructor() {
    // Setup scheduled job that expires old ads
    setInterval(() => this.purgeOldAds(), 5000)
  }

  /**
   * Remove all ads in the buffer that have expired.
   */
  private purgeOldAds() {
    const now = new Date().toISOString()
    Object.keys(this._buffer).forEach((orientation) => {
      Object.keys(this._buffer[orientation]).forEach((adType) => {
        const lenBefore = this._buffer[orientation][adType].length
        this._buffer[orientation][adType] = this._buffer[orientation][
          adType
        ].filter((ad) => ad.expires_at > now)
        const lenAfter = this._buffer[orientation][adType].length
        if (lenAfter !== lenBefore) {
          console.log(
            `Purged ${
              lenBefore - lenAfter
            } ad(s) from the buffer for ${orientation} ${adType}`,
          )
        }
      })
    })
  }

  /**
   * Empty the ad buffer.
   */
  public empty() {
    this._buffer = {}
  }

  /**
   * Force an empty buffer array for the ad type if non exists
   *
   * @param adType
   */
  private assertAdTypeKeyExists(orientation: Orientation, adType: AdType) {
    if (!(orientation in this._buffer)) {
      this._buffer[orientation] = {}
    }
    if (!(adType in this._buffer[orientation])) {
      this._buffer[orientation][adType] = []
    }
  }

  /**
   * Add an ad to the buffer
   *
   * @param item The ad to add
   */
  private add(item: AdResponseItem) {
    this.assertAdTypeKeyExists(item.ad.orientation, item.ad.type)
    this._buffer[item.ad.orientation][item.ad.type].push(item)
  }

  /**
   * Check if any ads exist in the buffer for the specific ad type
   *
   * @param adType The ad type to check
   * @returns boolean
   */
  private contains(orientation: Orientation, adType: AdType) {
    return orientation in this._buffer && adType in this._buffer[orientation]
  }

  /**
   * Add multiple ads to the buffer
   *
   * @param items Array of ads to add
   */
  addAll(items: AdResponseItem[]) {
    items.forEach((item) => {
      this.add(item)
    })
    Object.entries(this._buffer).forEach((entry) => {
      const orientation = entry[0]
      const value = entry[1]
      Object.entries(value).forEach((subEntry) => {
        const adType = subEntry[0]
        const ads = subEntry[1]
        console.log(
          `Ads in buffer for orientation ${orientation} of type ${adType}: ${ads.length}`,
        )
      })
    })
  }

  /**
   * Return the number of ads in the buffer for the specific ad type
   *
   * @param adType The ad type to check
   * @returns The number of ads
   */
  count(orientation: Orientation, adType: AdType) {
    if (!this.contains(orientation, adType)) {
      return 0
    }
    return this._buffer[orientation][adType].length
  }

  /**
   * Returns the first ad in the buffer for the given ad type
   *
   * @param adType The ad type to get an ad for
   * @returns
   */
  get(orientation: Orientation, adType: AdType) {
    if (!this.contains(orientation, adType)) {
      return null
    }
    const ad = this._buffer[orientation][adType].shift()!
    console.log(
      `Ads left in buffer for orientation ${orientation} and type ${adType}: ${this._buffer[orientation][adType].length}`,
    )
    return ad
  }
}

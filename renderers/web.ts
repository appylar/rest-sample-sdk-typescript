/**
 * =========================================================
 * Copyright (c) 2022 Appylar
 * =========================================================
 */
import {
  AdEvent,
  AdEventListener,
  AdResponseItem,
  Orientation,
  RendererImpl,
  ShowAdOptions,
} from '../interfaces'

/**
 * An example renderer implementation that works in a browser. This renderer
 * uses iframes.
 */
export class WebRenderer implements RendererImpl {
  private listeners: AdEventListener[] = []

  getScreenSize() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  getOrientation(): Orientation {
    const size = this.getScreenSize()
    return size.width > size.height ? 'landscape' : 'portrait'
  }

  addEventListener(callback: AdEventListener) {
    this.listeners.push(callback)
  }

  private triggerEvent(event: AdEvent) {
    this.listeners.forEach((callback) => callback(event))
  }

  showAd(ad: AdResponseItem, opts?: ShowAdOptions) {
    // Remove potential ads currently showing
    $('iframe').remove()

    // Prepare new ad
    const queryString =
      opts?.placement && opts?.placement.length > 0
        ? '?p=' + encodeURIComponent(opts.placement)
        : ''
    const iframe = $('<iframe>')
      .css('position', 'fixed')
      .attr('src', ad.url + queryString)
      .css({ background: 'white', zIndex: 1000 }) // This is our webview
    window.addEventListener('message', (event) => {
      if (event.data === 'close') {
        $('iframe').remove()
        this.triggerEvent({
          name: 'interstitial-closed',
        })
      }
    })
    iframe.addClass(ad.ad.type)
    switch (ad.ad.type) {
      case 'banner':
        // Overlay partly
        const key = (
          (opts?.position as unknown as string) ?? 'bottom'
        ).toLowerCase()
        iframe.width(window.innerWidth)
        iframe.height(ad.ad.height)
        iframe.css({
          left: 0,
          [key]: 0,
        })
        break
      case 'interstitial':
        // Overlay fullscreen
        iframe.width(window.innerWidth)
        iframe.height(window.innerHeight)
        iframe.css({
          left: 0,
          top: 0,
        })
        break
    }
    $('body').append(iframe)
  }

  hideBanner() {
    $('iframe.banner').remove()
    this.triggerEvent({
      name: 'banner-hidden',
    })
  }
}

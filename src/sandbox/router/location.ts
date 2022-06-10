/* eslint-disable no-void */
import type { MicroLocation } from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { assign as oAssign, rawDefineProperties, createURL } from '../../libs/utils'
import { setMicroPathToURL } from './core'
import { dispatchPurePopStateEvent } from './event'

/**
 * Create location for micro app
 * Each microApp has only one location object, it is a reference type
 * @param appName app name
 * @param url app url
 */
export function createMicroLocation (appName: string, url: string): MicroLocation {
  const rawWindow = globalEnv.rawWindow
  const rawLocation = rawWindow.location
  // microLocation is the location of child app, it is globally unique
  const microLocation = createURL(url) as MicroLocation
  // shadowLocation is the current location information (href, pathname, search, hash)
  const shadowLocation = {
    href: microLocation.href,
    pathname: microLocation.pathname,
    search: microLocation.search,
    hash: microLocation.hash,
  }

  /**
   * Common handler for href, assign, replace
   * It is mainly used to deal with special scenes about hash
   * @param value target path
   * @param methodName pushState/replaceState
   * @returns origin value or formatted value
   */
  const commonHandle = (value: string | URL, methodName: string): string | URL | undefined => {
    const targetLocation = createURL(value, url) as MicroLocation
    if (targetLocation.origin === microLocation.origin) {
      const setMicroPathResult = setMicroPathToURL(appName, targetLocation)
      /**
       * change hash with location.href = xxx will not trigger the browser reload
       * so we use pushState & reload to imitate href behavior
       * NOTE:
       *    1. if child app only change hash, it should not trigger browser reload
       *    2. if address is same and has hash, it should not add route stack
       */
      if (
        targetLocation.pathname === shadowLocation.pathname &&
        targetLocation.search === shadowLocation.search
      ) {
        if (targetLocation.hash !== shadowLocation.hash) {
          rawWindow.history[methodName](null, '', setMicroPathResult.fullPath)
        }

        if (targetLocation.hash) {
          dispatchPurePopStateEvent()
        } else {
          rawLocation.reload()
        }
        return void 0
      } else if (setMicroPathResult.attach2Hash) {
        rawWindow.history[methodName](null, '', setMicroPathResult.fullPath)
        rawLocation.reload()
        return void 0
      }

      value = setMicroPathResult.fullPath
    }

    return value
  }

  const createLocationMethod = (locationMethodName: string) => {
    return function (value: string | URL) {
      const formattedValue = commonHandle(value, locationMethodName === 'assign' ? 'pushState' : 'replaceState')
      if (formattedValue) rawLocation[locationMethodName](formattedValue)
    }
  }

  const assign = createLocationMethod('assign')

  const replace = createLocationMethod('replace')

  const reload = (forcedReload?: boolean): void => rawLocation.reload(forcedReload)

  oAssign(microLocation, {
    assign,
    replace,
    reload,
    shadowLocation,
  })

  /**
   * Special processing for four keys: href, pathname, search and hash
   * They take values from shadowLocation, and require special operations when assigning values
   */
  rawDefineProperties(microLocation, {
    href: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.href,
      set: (value: string): void => {
        const formattedValue = commonHandle(value, 'pushState')
        if (formattedValue) rawLocation.href = formattedValue
      }
    },
    pathname: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.pathname,
      set: (value: string): void => {
        const targetPath = ('/' + value).replace(/^\/+/, '/') + shadowLocation.search + shadowLocation.hash
        const targetLocation = createURL(targetPath, url) as MicroLocation
        // When the browser url has a hash value, the same pathname will not trigger the browser refresh
        if (targetLocation.pathname === shadowLocation.pathname && shadowLocation.hash) {
          dispatchPurePopStateEvent()
        } else {
          // When the value is the same, no new route stack will be added
          // Special scenes such as: /path ==> /path#hash, /path ==> /path?query
          const methodName = targetLocation.pathname === shadowLocation.pathname ? 'replaceState' : 'pushState'
          rawWindow.history[methodName](null, '', setMicroPathToURL(appName, targetLocation).fullPath)
          rawLocation.reload()
        }
      }
    },
    search: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.search,
      set: (value: string): void => {
        const targetPath = shadowLocation.pathname + ('?' + value).replace(/^\?+/, '?') + shadowLocation.hash
        const targetLocation = createURL(targetPath, url) as MicroLocation
        // When the browser url has a hash value, the same search will not trigger the browser refresh
        if (targetLocation.search === shadowLocation.search && shadowLocation.hash) {
          dispatchPurePopStateEvent()
        } else {
          // When the value is the same, no new route stack will be added
          // Special scenes such as: ?query ==> ?query#hash
          const methodName = targetLocation.search === shadowLocation.search ? 'replaceState' : 'pushState'
          rawWindow.history[methodName](null, '', setMicroPathToURL(appName, targetLocation).fullPath)
          rawLocation.reload()
        }
      }
    },
    hash: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.hash,
      set: (value: string): void => {
        const targetPath = shadowLocation.pathname + shadowLocation.search + ('#' + value).replace(/^#+/, '#')
        const targetLocation = createURL(targetPath, url) as MicroLocation
        // The same hash will not trigger popStateEvent
        if (targetLocation.hash !== shadowLocation.hash) {
          rawWindow.history.pushState(null, '', setMicroPathToURL(appName, targetLocation).fullPath)
          dispatchPurePopStateEvent()
        }
      }
    },
  })

  return microLocation
}

// origin is readonly, so we ignore it
const locationKeys = ['hash', 'host', 'hostname', 'href', 'password', 'pathname', 'port', 'protocol', 'search']
const shadowLocationKeys = ['href', 'pathname', 'search', 'hash']
/**
 * There are three situations that trigger location update:
 * 1. pushState/replaceState
 * 2. popStateEvent
 * 3. params on browser url when init sub app
 * @param path target path
 * @param base base url
 * @param microLocation micro app location
 */
export function updateLocation (
  path: string,
  base: string,
  microLocation: MicroLocation,
): void {
  const newLocation = createURL(path, base)
  for (const key of locationKeys) {
    if (shadowLocationKeys.includes(key)) {
      // @ts-ignore
      microLocation.shadowLocation[key] = newLocation[key]
    } else {
      // @ts-ignore
      microLocation[key] = newLocation[key]
    }
  }
}

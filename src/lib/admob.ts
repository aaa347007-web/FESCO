import { Capacitor, registerPlugin } from '@capacitor/core';

interface AdMobPlugin {
  initialize(options: { initializeForTesting?: boolean }): Promise<void>;
  showBanner(options: {
    adId: string;
    adSize?: string;
    position?: string;
    margin?: number;
    isTesting?: boolean;
  }): Promise<void>;
  hideBanner(): Promise<void>;
  removeBanner(): Promise<void>;
  prepareInterstitial(options: { adId: string; isTesting?: boolean }): Promise<void>;
  showInterstitial(): Promise<void>;
}

const AdMob = registerPlugin<AdMobPlugin>('AdMob');

// Real Google AdMob Ad Unit IDs for Pak Bill Manager
export const ADMOB_BANNER_ID = 'ca-app-pub-4460360638178090/8013467672';
export const ADMOB_INTERSTITIAL_ID = 'ca-app-pub-4460360638178090/1657436179';

let initialized = false;
let interstitialReady = false;

export async function initAdMobAndShowBanner(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!initialized) {
      await AdMob.initialize({ initializeForTesting: false });
      initialized = true;
    }

    await AdMob.showBanner({
      adId: ADMOB_BANNER_ID,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 64,
      isTesting: false,
    });

    await preloadInterstitial();
  } catch (err) {
    console.warn('AdMob init/banner skipped:', err);
  }
}

export async function hideBannerAd(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.hideBanner();
    await AdMob.removeBanner();
  } catch {
    // Already hidden or not shown yet
  }
}

export async function preloadInterstitial(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.prepareInterstitial({
      adId: ADMOB_INTERSTITIAL_ID,
      isTesting: false,
    });
    interstitialReady = true;
  } catch {
    interstitialReady = false;
  }
}

export async function showInterstitialAd(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!interstitialReady) {
      await preloadInterstitial();
    }
    await AdMob.showInterstitial();
    interstitialReady = false;
    preloadInterstitial();
  } catch (err) {
    console.warn('Interstitial skipped:', err);
  }
}

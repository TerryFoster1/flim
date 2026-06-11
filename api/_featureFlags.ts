export function isNativeAdsEnabled() {
  return process.env.ENABLE_NATIVE_ADS?.trim().toLowerCase() === "true";
}

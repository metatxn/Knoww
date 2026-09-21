export function isProductionAnalyticsHost(hostname: string): boolean {
  return hostname === "knoww.app" || hostname === "www.knoww.app";
}

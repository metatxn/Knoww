import type { RegionPolicy } from "../../core";

/**
 * Polymarket's published geographic restrictions, as they apply to orders
 * sent through the CLOB API.
 *
 * `blocked` is the OFAC list Polymarket refuses outright. `closeOnly` is the
 * list Polymarket enforces on both its frontend and its API: users there may
 * only reduce positions. Polymarket applies a further close-only list (IE,
 * JP, MT, NL) on its own frontend only; the API Knoww trades through does not
 * restrict those, so they stay open here.
 *
 * Subdivisions use ISO 3166-2 codes: Canadian provinces ("CA-ON") and the
 * occupied Ukrainian regions Crimea ("UA-43"), Donetsk ("UA-14") and Luhansk
 * ("UA-09"). Re-check these lists against polymarket.com whenever the
 * geoblock feed changes; nothing here is fetched at runtime.
 */
export const POLYMARKET_REGION_POLICY: RegionPolicy = {
  blocked: ["IR", "SY", "CU", "KP", "UA-43", "UA-14", "UA-09"],
  closeOnly: [
    "AU",
    "BY",
    "BE",
    "BI",
    "BR",
    "CA-BC",
    "CA-ON",
    "CA-AB",
    "CA-QC",
    "CF",
    "CD",
    "ET",
    "FR",
    "DE",
    "IQ",
    "IT",
    "LB",
    "LY",
    "MM",
    "NZ",
    "NI",
    "KP",
    "PL",
    "RU",
    "SG",
    "SO",
    "SK",
    "SS",
    "SD",
    "TW",
    "TH",
    "GB",
    "US",
    "UM",
    "VE",
    "YE",
    "ZW",
  ],
};

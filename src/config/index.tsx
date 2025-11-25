import {
  type AppKitNetwork,
  arbitrum,
  mainnet,
  polygon,
  polygonAmoy,
} from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage } from "wagmi";

// Get projectId from https://dashboard.reown.com2
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error("Project ID is not defined in config");
}

// Set up the networks you want to support
// Using Polygon since Polymarket runs on Polygon
export const networks = [polygon, mainnet, arbitrum, polygonAmoy] as [
  AppKitNetwork,
  ...AppKitNetwork[]
];

// Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks,
});

export const config = wagmiAdapter.wagmiConfig;

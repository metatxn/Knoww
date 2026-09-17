import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import PrivacyClient from "./privacy-client";
import "../styles/marketing.css";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "Privacy Policy for Knoww, the Knoww Extension, and Knoww MCP. How we collect, use, share, protect, retain, and delete your data, including Google sign-in data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <PrivacyClient />;
}

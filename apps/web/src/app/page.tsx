import type { Metadata } from "next";
import { LtfmHome } from "@/components/research-site/home-content";
import { ResearchSiteShell } from "@/components/research-site/site-shell";
import { buildPageMetadata } from "@/lib/seo";
import "@/components/research-site/home.css";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Knoww Research Lab | Longitudinal tabular foundation models",
    description:
      "Knoww is building LTFM, a longitudinal tabular foundation model. Train once on millions of worlds. Predict from your tables without retraining.",
    path: "/",
    image: "/ltfm-og.png",
  }),
  title: {
    absolute: "Knoww Research Lab | Longitudinal tabular foundation models",
  },
  keywords: [
    "tabular foundation model",
    "LTFM",
    "longitudinal data",
    "prior-data fitted networks",
    "Knoww Research Lab",
  ],
};

export default function LandingPage() {
  return (
    <ResearchSiteShell>
      <LtfmHome />
    </ResearchSiteShell>
  );
}

import { ResearchContent } from "@/components/research-site/research-content";
import { ResearchSiteShell } from "@/components/research-site/site-shell";
import { buildPageMetadata } from "@/lib/seo";
import "@/components/research-site/research.css";

export const metadata = buildPageMetadata({
  title: "LTFM research",
  description:
    "How Knoww is building LTFM. Explore prior-data fitted networks, the first experiment and the research behind longitudinal tabular foundation models.",
  path: "/research",
  image: "/ltfm-og.png",
});
export default function Page() {
  return (
    <ResearchSiteShell>
      <ResearchContent />
    </ResearchSiteShell>
  );
}

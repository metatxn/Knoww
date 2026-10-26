import { ResearchSiteShell } from "@/components/research-site/site-shell";
import { UseCasesContent } from "@/components/research-site/usecases-content";
import { buildPageMetadata } from "@/lib/seo";
import "@/components/research-site/usecases.css";

export const metadata = buildPageMetadata({
  title: "LTFM use cases",
  description:
    "Explore longitudinal tabular foundation model use cases in finance, insurance, healthcare, supply chain, retail, policy and geopolitics.",
  path: "/use-cases",
  image: "/ltfm-og.png",
});
export default function Page() {
  return (
    <ResearchSiteShell>
      <UseCasesContent />
    </ResearchSiteShell>
  );
}

import { CompanyContent } from "@/components/research-site/company-content";
import { ResearchSiteShell } from "@/components/research-site/site-shell";
import { buildPageMetadata } from "@/lib/seo";
import "@/components/research-site/company.css";

export const metadata = buildPageMetadata({
  title: "About Knoww Research Lab",
  description:
    "Meet the team building Knoww and explore the research story and proposed 24-month roadmap for LTFM.",
  path: "/company",
  image: "/ltfm-og.png",
});
export default function Page() {
  return (
    <ResearchSiteShell>
      <CompanyContent />
    </ResearchSiteShell>
  );
}

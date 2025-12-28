import type { Metadata } from "next";
import { POLYMARKET_API } from "@/constants/polymarket";
import EventDetailClient from "./event-detail-client";

type Props = {
  params: Promise<{ slug: string }>;
};

interface GammaEvent {
  title: string;
  description?: string;
  image?: string;
}

async function getEvent(slug: string): Promise<GammaEvent | null> {
  try {
    const res = await fetch(`${POLYMARKET_API.GAMMA.EVENTS}/slug/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as GammaEvent;
  } catch (error) {
    console.error("Error fetching event for metadata:", error);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) {
    return {
      title: "Event Not Found",
      description: "The requested event could not be found.",
    };
  }

  const title = event.title;
  const description =
    event.description ||
    `Trade on this prediction event: ${event.title}. Explore odds and make your prediction on Knoww.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://knoww.app/events/detail/${slug}`,
    },
    openGraph: {
      title,
      description,
      images: event.image ? [event.image] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: event.image ? [event.image] : [],
    },
  };
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  return <EventDetailClient slug={slug} />;
}

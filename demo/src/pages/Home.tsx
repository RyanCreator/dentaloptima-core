import { Hero } from "@/components/sections/Hero";
import { AboutIntro } from "@/components/sections/AboutIntro";
import { ServicesPreview } from "@/components/sections/ServicesPreview";
import { TeamPreview } from "@/components/sections/TeamPreview";
import { Testimonials } from "@/components/sections/Testimonials";
import { FinalCta } from "@/components/sections/FinalCta";
import { practice } from "@/config/practice.config";
import { useSeo } from "@/lib/seo";

export default function Home() {
  useSeo({
    title: practice.seo.homeTitle,
    description: practice.seo.homeDescription,
    path: "/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: practice.name,
        url: `https://${practice.contact.bookingHostname}`,
        inLanguage: "en-GB",
        publisher: { "@type": "Dentist", name: practice.name },
      },
    ],
  });

  return (
    <>
      <Hero />
      <AboutIntro />
      <ServicesPreview />
      <TeamPreview />
      <Testimonials />
      <FinalCta />
    </>
  );
}

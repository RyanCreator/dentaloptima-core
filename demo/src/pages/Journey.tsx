import { JourneyExperience } from "@/components/journey/JourneyExperience";
import { practice } from "@/config/practice.config";
import { useSeo } from "@/lib/seo";

// Standalone, full-page "patient journey" landing experience. Rendered outside
// the normal site Layout (it owns the whole viewport) — its own minimal chrome
// links back to the site and to booking.
export default function Journey() {
  useSeo({
    title: `Your journey | ${practice.name}`,
    description: `Take a guided tour of what it's like to be a patient at ${practice.name} — from booking your first visit to ongoing care.`,
    path: "/journey",
  });

  return <JourneyExperience />;
}

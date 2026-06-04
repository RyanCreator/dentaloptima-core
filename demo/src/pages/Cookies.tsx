import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { useSeo } from "@/lib/seo";

export default function Cookies() {
  useSeo({
    title: `Cookie Policy | ${practice.seo.siteTitle}`,
    description: `The cookies we use on ${practice.name}'s website and how to control them.`,
    path: "/cookies",
  });

  return (
    <section className="pt-32 md:pt-40 pb-20">
      <Container>
        <article className="prose prose-lg max-w-none prose-headings:font-display prose-headings:text-ink">
          <h1>Cookie Policy</h1>
          <p>
            We use a small number of cookies on this website to keep it
            working and — only if you opt in — to understand how it's used.
            You can change your preferences at any time by clearing site
            data in your browser, or by re-opening the cookie banner from
            the link in the footer.
          </p>

          <h2>Essential cookies</h2>
          <p>
            These make the site work and can't be turned off. They store
            your cookie-banner choice, remember you've dismissed
            announcements, and keep your booking-form progress between
            steps. They never send personal data anywhere.
          </p>

          <h2>Analytics cookies</h2>
          <p>
            If you click <strong>"Accept all"</strong> on the cookie
            banner, we load Google Analytics 4 to understand how visitors
            use the site in aggregate — which pages get the most visits,
            how people get to the booking form, where they drop off. Your
            IP address is anonymised before it leaves your browser, and we
            never combine analytics data with your patient records.
          </p>
          <p>
            If you click <strong>"Reject"</strong>, no analytics cookies
            are set. The site works exactly the same; we just don't see
            the aggregate stats.
          </p>

          <h2>What we don't use</h2>
          <p>
            No advertising pixels, no remarketing, no cross-site tracking.
            We don't run Meta Pixel, Google Ads conversion tracking, or
            any third-party ad-tech scripts. Nothing on this site follows
            you around the rest of the web.
          </p>

          <h2>Controlling cookies</h2>
          <p>
            You can block or delete cookies through your browser settings
            at any time. See{" "}
            <a
              href="https://www.aboutcookies.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              aboutcookies.org
            </a>{" "}
            for step-by-step guides for every major browser.
          </p>

          <h2>Updates</h2>
          <p>
            If we ever change which cookies we use, we'll update this page
            and re-show the cookie banner so you can choose again. Material
            changes will also be highlighted at the top of this page.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about cookies or anything else privacy-related,
            email{" "}
            <a href={`mailto:${practice.contact.email}`}>
              {practice.contact.email}
            </a>
            .
          </p>

          <p className="text-sm text-ink/55">
            Last updated: {new Date().toLocaleDateString("en-GB")}
          </p>
        </article>
      </Container>
    </section>
  );
}

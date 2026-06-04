import { Link } from "react-router-dom";
import { Button } from "@/components/Button";
import { Container } from "@/components/Container";
import { useSeo } from "@/lib/seo";

export default function NotFound() {
  useSeo({
    title: "Page not found",
    description: "That page doesn't exist — let's get you back on track.",
    path: "/404",
  });
  return (
    <section className="pt-32 md:pt-40 pb-20">
      <Container>
        <div className="max-w-xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
            404
          </p>
          <h1 className="font-display text-4xl md:text-5xl text-ink mb-4">
            We couldn't find that page
          </h1>
          <p className="text-ink/70 mb-8">
            The link may be out of date, or we may have moved the page.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button asChild>
              <Link to="/">Back to home</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

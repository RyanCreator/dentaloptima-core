import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link } from "react-router-dom";

// CTA target may be a route (/book), an in-page anchor (#journey-start), or a
// tel: link. Forwards ref + all props (incl. the className Radix Slot injects
// via Button asChild) onto the underlying anchor.
export const CtaLink = forwardRef<
  HTMLAnchorElement,
  { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>
>(({ to, ...rest }, ref) =>
  to.startsWith("/") ? (
    <Link ref={ref} to={to} {...rest} />
  ) : (
    <a ref={ref} href={to} {...rest} />
  ),
);
CtaLink.displayName = "CtaLink";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { trust } from "./journeyData";

// Slim social-proof strip directly under the hero: headline stats + regulator
// badges. Dark, so it bridges the hero into the lighter journey below.
export function TrustBand() {
  return (
    <section className="relative z-20 -mt-px bg-ink text-white">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {trust.stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="text-center md:text-left"
            >
              <div className="font-display text-3xl font-semibold text-white md:text-4xl">{s.value}</div>
              <div className="mt-1 text-xs text-white/55">{s.label}</div>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/10 pt-6 md:justify-start">
          {trust.badges.map((b) => (
            <span key={b} className="flex items-center gap-1.5 text-xs font-medium text-white/65">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

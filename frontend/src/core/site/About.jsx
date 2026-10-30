import { Link } from "react-router-dom"
import { ArrowRight, Sparkles } from "lucide-react"
import { ABOUT, COMPANY } from "./siteContent"
import { Reveal, SectionHead, heading, wrap } from "./siteKit"
import SiteShell from "./SiteShell"

/* About us. All text comes from siteContent.js (placeholder until the real company text is in). */
export default function About() {
  return (
    <SiteShell>
      <section className="pt-40 pb-16 lg:pt-48">
        <div className={wrap}>
          <Reveal immediate>
            <p className="text-sm font-semibold text-lp-green">About us</p>
            <h1 className="mt-2 max-w-[680px] bg-linear-to-r from-black to-[#666666] bg-clip-text pb-1 font-lp-head text-4xl font-bold tracking-tight text-balance text-transparent sm:text-5xl">
              {COMPANY.name}
            </h1>
            <p className="mt-6 max-w-[680px] text-lg text-pretty">{ABOUT.intro}</p>
          </Reveal>

          <Reveal immediate delay={0.1}>
            <dl className="mt-12 grid max-w-2xl grid-cols-3 gap-6">
              {ABOUT.facts.map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-lp-line bg-white p-4">
                  <dt className="sr-only">{label}</dt>
                  <dd className="text-2xl font-bold text-lp-ink">{value}</dd>
                  <dd className="text-sm text-lp-muted">{label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-lp-line bg-white py-20">
        <div className={`${wrap} grid gap-12 lg:grid-cols-2`}>
          <SectionHead eyebrow="Our story" title="Lorem ipsum dolor sit amet" />
          <Reveal className="grid gap-4 text-lg text-pretty">
            {ABOUT.story.map((p, i) => <p key={i}>{p}</p>)}
          </Reveal>
        </div>
      </section>

      <section className="py-20">
        <div className={wrap}>
          <SectionHead eyebrow="What we stand for" title="Consectetur adipiscing elit" />
          <ul className="grid gap-4 md:grid-cols-3">
            {ABOUT.values.map((v, i) => (
              <Reveal as="li" key={v.title} delay={i * 0.06} className="rounded-2xl border border-lp-line bg-white p-6">
                <span className="grid size-10 place-items-center rounded-lg bg-lp-tint text-lp-green">
                  <Sparkles className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-lp-ink">{v.title}</h3>
                <p className="mt-1 text-sm text-pretty text-lp-muted">{v.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <Reveal className="mx-auto max-w-6xl rounded-3xl bg-lp-deep px-6 py-14 sm:px-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <p className="text-sm font-semibold text-white/95">The software</p>
              <h2 className={`${heading} mt-2 text-3xl font-bold text-white`}>EPIMS</h2>
              <p className="mt-3 text-lg text-pretty text-white/95">{ABOUT.software}</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link to="/#login" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-base font-semibold text-lp-deep outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-lp-deep">
                Log in <ArrowRight className="size-4" />
              </Link>
              <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-base font-semibold text-white ring-1 ring-inset ring-white/40 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white">
                Contact us
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </SiteShell>
  )
}

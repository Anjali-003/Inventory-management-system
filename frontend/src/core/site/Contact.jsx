import { useState } from "react"
import { Clock, Mail, MapPin, Phone, Send } from "lucide-react"
import { CONTACT } from "./siteContent"
import { Reveal, btnPrimary, focusRing, wrap } from "./siteKit"
import SiteShell from "./SiteShell"

/*
  Contact us. Details come from siteContent.js (placeholder until the real ones are in).
  The form does not pretend to send anything: it checks the fields, then opens the visitor's own email app with the
  message already written to CONTACT.email. No backend needed, and it works as soon as the real address is set.
*/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FIELD =
  "mt-1.5 w-full rounded-lg border border-lp-rule bg-white px-3 py-2 text-base text-lp-ink outline-none transition-shadow placeholder:text-lp-muted focus-visible:border-lp-green focus-visible:ring-3 focus-visible:ring-lp-green/20 aria-invalid:border-red-600"

function Row({ icon: Icon, label, children }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-lp-tint text-lp-green">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-lp-ink">{label}</p>
        <div className="mt-0.5 text-sm text-lp-text">{children}</div>
      </div>
    </li>
  )
}

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" })
  const [errors, setErrors] = useState({})
  const [opened, setOpened] = useState(false)
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((x) => ({ ...x, [key]: undefined }))
  }

  const submit = (e) => {
    e.preventDefault()
    const found = {}
    if (form.name.trim().length < 2) found.name = "Enter your name."
    if (!EMAIL_RE.test(form.email.trim())) found.email = "Enter a valid email address, for example name@company.com."
    if (form.message.trim().length < 10) found.message = "Write a message of at least 10 characters."
    setErrors(found)
    if (Object.keys(found).length) return
    const subject = form.subject.trim() || `Message from ${form.name.trim()}`
    const body = `${form.message.trim()}\n\n${form.name.trim()}\n${form.email.trim()}`
    window.location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setOpened(true)
  }

  const field = (key, label, props = {}) => (
    <div>
      <label htmlFor={`c-${key}`} className="text-sm font-semibold text-lp-ink">
        {label}
        {props.required && <span className="ml-0.5 text-red-700" aria-hidden>*</span>}
      </label>
      {props.as === "textarea" ? (
        <textarea id={`c-${key}`} rows={5} value={form[key]} onChange={set(key)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `c-${key}-error` : undefined} className={FIELD} />
      ) : (
        <input id={`c-${key}`} type={props.type || "text"} autoComplete={props.autoComplete} value={form[key]} onChange={set(key)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `c-${key}-error` : undefined} className={FIELD} />
      )}
      {errors[key] && <p id={`c-${key}-error`} className="mt-1.5 text-sm text-red-700">{errors[key]}</p>}
    </div>
  )

  return (
    <SiteShell>
      <section className="pt-40 pb-20 lg:pt-48">
        <div className={wrap}>
          <Reveal immediate>
            <p className="text-sm font-semibold text-lp-green">Contact us</p>
            <h1 className="mt-2 max-w-[680px] bg-linear-to-r from-black to-[#666666] bg-clip-text pb-1 font-lp-head text-4xl font-bold tracking-tight text-balance text-transparent sm:text-5xl">
              Get in touch
            </h1>
            <p className="mt-6 max-w-[680px] text-lg text-pretty">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Write to us or call, we usually reply within one working day.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <Reveal immediate delay={0.05}>
              <ul className="grid gap-6 rounded-2xl border border-lp-line bg-white p-6">
                <Row icon={Mail} label="Email">
                  <a href={`mailto:${CONTACT.email}`} className={`rounded font-medium text-lp-green hover:underline ${focusRing}`}>{CONTACT.email}</a>
                </Row>
                <Row icon={Phone} label="Phone">
                  <a href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`} className={`rounded font-medium text-lp-green hover:underline ${focusRing}`}>{CONTACT.phone}</a>
                </Row>
                <Row icon={MapPin} label="Address">
                  <address className="not-italic">{CONTACT.address.map((line) => <span key={line} className="block">{line}</span>)}</address>
                </Row>
                <Row icon={Clock} label="Working hours">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
                    {CONTACT.hours.map(([day, time]) => (
                      <div key={day} className="contents">
                        <dt>{day}</dt>
                        <dd className="text-lp-muted">{time}</dd>
                      </div>
                    ))}
                  </dl>
                </Row>
              </ul>
            </Reveal>

            <Reveal immediate delay={0.1}>
              <form noValidate onSubmit={submit} className="grid gap-5 rounded-2xl border border-lp-line bg-white p-6" aria-labelledby="contact-form-title">
                <h2 id="contact-form-title" className="text-xl font-bold text-lp-ink">Send us a message</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  {field("name", "Your name", { required: true, autoComplete: "name" })}
                  {field("email", "Your email", { required: true, type: "email", autoComplete: "email" })}
                </div>
                {field("subject", "Subject")}
                {field("message", "Message", { required: true, as: "textarea" })}
                <div className="flex flex-wrap items-center gap-4">
                  <button type="submit" className={btnPrimary}>
                    <Send className="size-4" /> Write the email
                  </button>
                  <p className="text-sm text-lp-muted" aria-live="polite">
                    {opened ? "Your email app should open with the message ready to send." : "Opens your email app with this message ready to send."}
                  </p>
                </div>
              </form>
            </Reveal>
          </div>
        </div>
      </section>
    </SiteShell>
  )
}

"use client";

import NumberFlow from "@number-flow/react";
import { Check, ChevronDown, Clover, Fan, Gem, Quote } from "lucide-react";
import { Accordion, Tooltip } from "radix-ui";
import { useState, type ReactNode } from "react";
import { ButtonLink } from "../components/button";
import { SegmentedControl } from "../components/segmented-control";
import { Stripe } from "../components/svgs/stripe";
import { useMedia } from "../hooks/use-media";
import { MESCHAC_AVATAR } from "../lib/const";
import { SitePage } from "./site";

/*
 * Pricing – Tailark's Grid 1 "Pricing One" page (hero, plans, testimonial, comparison, FAQs) in the site's frame, its
 * copy as it ships for now. Not linked from anywhere yet. The template's frame lines are gone: only the site's dotted
 * rule, around the plans and the testimonial; the comparison and the FAQs separate by space and surfaces alone.
 */

type Period = "Monthly" | "Annually";
const annualReduction = 0.75;
const prices = { pro: { Monthly: 19, Annually: 19 * annualReduction }, startup: { Monthly: 49, Annually: 49 * annualReduction } };
const currency = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const;

export function PricingPage() {
  return (
    <SitePage window={false}>
      <style href="ui-web-pricing" precedence="default">{css}</style>
      <div className="ui-prc">
        <header className="ui-prc-hero">
          <h1>Pricing that scale with your business</h1>
          <p>Choose the perfect plan for your needs and start optimizing your workflow today</p>
        </header>
        <Plans />
        <Testimonial />
        <Comparator />
        <FAQs />
      </div>
    </SitePage>
  );
}

/* ---------- Plans ---------- */

function PlanList({ items, lead = false }: { items: string[]; lead?: boolean }) {
  return (
    <ul role="list" className="ui-prc-plan__list">
      {items.map((item, index) => (
        <li key={index} data-lead={lead && index === 0 ? "" : undefined}>
          {!(lead && index === 0) && <Check aria-hidden="true" strokeWidth={3.5} />}
          {item}
        </li>
      ))}
    </ul>
  );
}

function Plans() {
  const [period, setPeriod] = useState<Period>("Annually");
  return (
    <section className="ui-prc-plans">
      <div className="ui-prc-period">
        <SegmentedControl options={["Monthly", "Annually"]} value={period} onChange={(next) => setPeriod(next as Period)} label="Billing period" />
        <p><span className="ui-prc-period__save">Save 25%</span> On Annual Billing</p>
      </div>
      <div className="ui-prc-grid ui-prc-rule">
        <div className="ui-prc-plan">
          <div className="ui-prc-plan__head">
            <h2>Free</h2>
            <p>For developers trying out Tailark for the first time</p>
          </div>
          <div>
            <NumberFlow value={0} prefix="$" className="ui-prc-plan__price" />
            <p className="ui-prc-plan__per">Per month</p>
          </div>
          <ButtonLink variant="secondary" href="#" className="ui-prc-plan__cta">Get Started</ButtonLink>
          <PlanList items={["Basic Analytics Dashboard", "5GB Cloud Storage", "Email and Chat Support"]} />
        </div>
        <div className="ui-prc-plan ui-prc-plan--featured">
          <div className="ui-prc-plan__head">
            <h2>Pro</h2>
            <p>Ideal for developers who need more features and support</p>
          </div>
          <div>
            <NumberFlow value={prices.pro[period]} format={currency} className="ui-prc-plan__price" />
            <p className="ui-prc-plan__per">Per month</p>
          </div>
          <ButtonLink href="#" className="ui-prc-plan__cta">Get Started</ButtonLink>
          <PlanList lead items={["Everything in Free Plan plus:", "5GB Cloud Storage", "Email and Chat Support", "Access to Community Forum", "Single User Access", "Access to Basic Templates", "Mobile App Access", "1 Custom Report Per Month", "Monthly Product Updates", "Standard Security Features"]} />
        </div>
        <div className="ui-prc-plan">
          <div className="ui-prc-plan__head">
            <h2>Startup</h2>
            <p>For startups that need more advanced features and support.</p>
          </div>
          <div>
            <NumberFlow value={prices.startup[period]} format={currency} className="ui-prc-plan__price" />
            <p className="ui-prc-plan__per">Per month</p>
          </div>
          <ButtonLink variant="secondary" href="#" className="ui-prc-plan__cta">Get Started</ButtonLink>
          <PlanList lead items={["Everything in Pro Plan plus:", "5GB Cloud Storage", "Email and Chat Support", "Multi-User Access", "1 Custom Report Per Month", "Monthly Product Updates", "Standard Security Features", "Access to Advanced Templates", "Access to Community Forum", "Mobile App Access"]} />
        </div>
      </div>
    </section>
  );
}

/* ---------- Testimonial ---------- */

function Testimonial() {
  return (
    <section className="ui-prc-quote ui-prc-rule">
      <div className="ui-prc-quote__inner">
        <Quote aria-hidden="true" className="ui-prc-quote__mark" />
        <Stripe className="ui-prc-quote__logo" />
        <blockquote>Using Tailark has been like unlocking a secret design superpower. It's the perfect fusion of simplicity and versatility, enabling us to create UIs that are as stunning as they are user-friendly.</blockquote>
        <div className="ui-prc-quote__who">
          <img src={MESCHAC_AVATAR} alt="Méschac Irung" loading="lazy" width={460} height={460} />
          <div>
            <p className="ui-prc-quote__name">Méschac Irung</p>
            <p className="ui-prc-quote__role">Founder & CEO, Stripe</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Comparator ---------- */

const plans = ["free", "pro", "team"] as const;
type Plan = (typeof plans)[number];
type Feature = { name: string; description?: string; plans: Record<Plan, boolean | string> };
type Category = { name: string; description?: string; features: Feature[] };

const categories: Category[] = [
  {
    name: "Platform",
    description: "Core features that enable seamless operations of your SaaS",
    features: [
      { name: "Daily Exercises", description: "Engage users with daily interactive exercises.", plans: { free: true, pro: true, team: true } },
      { name: "Unlimited Storage", description: "Store unlimited data with no additional cost.", plans: { free: "2 GB", pro: "100 GB", team: "Unlimited" } },
      { name: "Custom Dashboards", description: "Create personalized dashboards for data visualization.", plans: { free: true, pro: true, team: true } },
      { name: "Self-paced Learning", description: "Empower users to learn at their own pace.", plans: { free: true, pro: true, team: true } },
      { name: "Ad-free Experience", description: "Provide an uninterrupted, ad-free environment.", plans: { free: false, pro: true, team: true } },
      { name: "Team Collaboration", description: "Enhance productivity with team collaboration tools.", plans: { free: false, pro: false, team: true } },
    ],
  },
  {
    name: "Infrastructure",
    description: "Robust infrastructure to support your SaaS needs",
    features: [
      { name: "Global CDN", description: "Deliver content rapidly across the globe.", plans: { free: true, pro: true, team: "Unlimited" } },
      { name: "Scalable Servers", description: "Automatically scale resources as demand grows.", plans: { free: false, pro: true, team: "Unlimited" } },
      { name: "Data Backups", description: "Ensure data safety with regular backups.", plans: { free: false, pro: "3 days", team: "1 month" } },
      { name: "API Access", description: "Integrate seamlessly with third-party services.", plans: { free: false, pro: true, team: true } },
      { name: "24/7 Monitoring", description: "Keep your platform running smoothly with constant monitoring.", plans: { free: false, pro: true, team: true } },
      { name: "Load Balancing", description: "Distribute traffic efficiently across servers.", plans: { free: false, pro: false, team: true } },
    ],
  },
  {
    name: "Support",
    description: "Comprehensive support to assist your users",
    features: [
      { name: "Priority Support", description: "Get fast-track assistance for urgent issues.", plans: { free: false, pro: true, team: true } },
      { name: "Live Chat", description: "Provide real-time support via chat.", plans: { free: false, pro: true, team: true } },
      { name: "Knowledge Base", description: "Access a rich repository of self-help articles.", plans: { free: true, pro: false, team: true } },
      { name: "Onboarding Assistance", description: "Ensure smooth onboarding with expert guidance.", plans: { free: false, pro: "1 hour", team: "12 hours" } },
      { name: "Community Forums", description: "Engage in community discussions and support.", plans: { free: true, pro: true, team: true } },
      { name: "Dedicated Account Manager", description: "Receive personalized service and support.", plans: { free: false, pro: false, team: true } },
    ],
  },
  {
    name: "Analytics",
    description: "Advanced analytics to drive data-driven decisions",
    features: [
      { name: "Real-time Reports", description: "Generate instant reports to track performance.", plans: { free: false, pro: true, team: true } },
      { name: "User Insights", description: "Analyze user behavior to improve engagement.", plans: { free: false, pro: true, team: true } },
      { name: "Custom Metrics", description: "Define and track metrics that matter to you.", plans: { free: false, pro: "10", team: "Unlimited" } },
      { name: "A/B Testing", description: "Optimize features through controlled experiments.", plans: { free: false, pro: false, team: true } },
      { name: "Predictive Analytics", description: "Leverage AI to predict future trends.", plans: { free: false, pro: false, team: true } },
    ],
  },
];

const planNames: Record<Plan, string> = { free: "Free", pro: "Pro", team: "Team" };
const planIcons: Record<Plan, ReactNode> = { free: <Clover aria-hidden="true" />, pro: <Gem aria-hidden="true" />, team: <Fan aria-hidden="true" /> };
const planActions: Record<Plan, ReactNode> = {
  free: <ButtonLink variant="secondary" size="sm" href="#">Get Started</ButtonLink>,
  pro: <ButtonLink size="sm" href="#">Start a free trial</ButtonLink>,
  team: <ButtonLink variant="secondary" size="sm" href="#">Contact Us</ButtonLink>,
};

function Indicator({ checked = false }: { checked?: boolean }) {
  return <span className="ui-prc-mark" data-checked={checked || undefined} aria-label={checked ? "Included" : "Not included"}>{checked ? "✓" : "✗"}</span>;
}

function PlanColumn({ plan }: { plan: Plan }) {
  return (
    <div className="ui-prc-col" data-plan={plan}>
      <div className="ui-prc-col__head">
        {planIcons[plan]}
        <span>{planNames[plan]}</span>
      </div>
      {categories.map((category) => (
        <div key={category.name}>
          <div className="ui-prc-cat__space" aria-hidden="true" />
          {category.features.map((feature) => {
            const value = feature.plans[plan];
            return <div key={feature.name} className="ui-prc-cell">{value === true ? <Indicator checked /> : value === false ? <Indicator /> : value}</div>;
          })}
        </div>
      ))}
      <div className="ui-prc-col__action">{planActions[plan]}</div>
    </div>
  );
}

function Comparator() {
  const [active, setActive] = useState<Plan>("pro");
  const wide = useMedia("(min-width: 768px)");
  return (
    <section className="ui-prc-compare" aria-label="Compare plans">
      {!wide && (
        <div className="ui-prc-compare__bar">
          <SegmentedControl size="compact" options={plans.map((plan) => planNames[plan])} value={planNames[active]} onChange={(next) => setActive(plans.find((plan) => planNames[plan] === next) ?? "pro")} label="Plan" />
          {planActions[active]}
        </div>
      )}
      <Tooltip.Provider delayDuration={400}>
        <div className="ui-prc-table">
          <div className="ui-prc-features">
            <div className="ui-prc-col__head ui-prc-features__head">Features</div>
            {categories.map((category) => (
              <div key={category.name}>
                <div className="ui-prc-cat">
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>
                {category.features.map((feature) => (
                  <div key={feature.name} className="ui-prc-cell ui-prc-feature">
                    <span>{feature.name}</span>
                    {feature.description && (
                      <Tooltip.Root>
                        <Tooltip.Trigger className="ui-prc-help" aria-label={`About ${feature.name}`}><span>?</span></Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content sideOffset={4} className="ui-prc-tip">{feature.description}</Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="ui-prc-plans-cols">
            {(wide ? plans : [active]).map((plan) => <PlanColumn key={plan} plan={plan} />)}
          </div>
        </div>
      </Tooltip.Provider>
    </section>
  );
}

/* ---------- FAQs ---------- */

const faqItems = [
  {
    group: "General",
    items: [
      { id: "item-1", question: "How long does shipping take?", answer: "Standard shipping takes 3-5 business days, depending on your location. Express shipping options are available at checkout for 1-2 business day delivery." },
      { id: "item-2", question: "What payment methods do you accept?", answer: "We accept all major credit cards (Visa, Mastercard, American Express), PayPal, Apple Pay, and Google Pay. For enterprise customers, we also offer invoicing options." },
      { id: "item-3", question: "Can I change or cancel my order?", answer: "You can modify or cancel your order within 1 hour of placing it. After this window, please contact our customer support team who will assist you with any changes." },
    ],
  },
  {
    group: "Shipping",
    items: [
      { id: "item-1", question: "Do you ship internationally?", answer: "Standard shipping takes 3-5 business days, depending on your location. Express shipping options are available at checkout for 1-2 business day delivery." },
      { id: "item-2", question: "What is your return policy?", answer: "We offer a 30-day return policy for most items. Products must be in original condition with tags attached. Some specialty items may have different return terms, which will be noted on the product page." },
      { id: "item-3", question: "Do you ship internationally?", answer: "Standard shipping takes 3-5 business days, depending on your location. Express shipping options are available at checkout for 1-2 business day delivery." },
    ],
  },
];

function FAQs() {
  const contact = <>Can't find what you're looking for? Contact our <a href="#">customer support team</a></>;
  return (
    <section id="faqs" className="ui-prc-faqs">
      <div className="ui-prc-faqs__intro">
        <h2>FAQs</h2>
        <p className="ui-prc-faqs__lead">Your questions answered</p>
        <p className="ui-prc-faqs__contact">{contact}</p>
      </div>
      <div className="ui-prc-faqs__groups">
        {faqItems.map((group) => (
          <div key={group.group}>
            <h3>{group.group}</h3>
            <Accordion.Root type="single" collapsible className="ui-prc-acc">
              {group.items.map((item) => (
                <Accordion.Item key={item.id} value={item.id} className="ui-prc-acc__item">
                  <Accordion.Header className="ui-prc-acc__header">
                    <Accordion.Trigger className="ui-prc-acc__trigger">
                      {item.question}
                      <ChevronDown aria-hidden="true" />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="ui-prc-acc__content">
                    <p>{item.answer}</p>
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          </div>
        ))}
      </div>
      <p className="ui-prc-faqs__contact ui-prc-faqs__contact--narrow">{contact}</p>
    </section>
  );
}

const css = /* css */ `
.ui-prc { max-width: 1280px; margin: 0 auto; padding: 0 8px 64px; container: ui-prc / inline-size; }
@media (max-width: 1303px) { .ui-prc { padding-inline: 20px; } }
/* The site's dotted rule, above and below */
.ui-prc-rule { background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x, var(--ui-web-rule) left bottom / var(--ui-web-rule-size) repeat-x; }

.ui-prc-hero { max-width: 42rem; margin: 0 auto; padding: 72px 0 40px; text-align: center; }
.ui-prc-hero h1 { margin: 0; font-size: clamp(36px, 5vw, 56px); line-height: 1.05; font-weight: 650; letter-spacing: -0.035em; text-wrap: balance; }
.ui-prc-hero p { max-width: 34rem; margin: 16px auto 0; color: var(--muted); font-size: 17px; line-height: 1.6; text-wrap: balance; }

.ui-prc-period { display: grid; justify-items: center; gap: 12px; margin-bottom: 48px; }
.ui-prc-period p { margin: 0; color: var(--muted); font-size: var(--fs-caption); }
.ui-prc-period__save { color: var(--brand); font-weight: 600; }

/* Three plans, their rows aligned across the columns; Pro on a card */
.ui-prc-grid { display: grid; grid-template-columns: minmax(0, 1fr); padding: 1px 0; }
@container ui-prc (min-width: 900px) { .ui-prc-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.ui-prc-plan { display: grid; grid-row: span 4; grid-template-rows: subgrid; gap: 32px; padding: 32px 24px; }
.ui-prc-plan--featured { margin: 8px 0; border-radius: calc(16px * var(--squircle-factor, 1)); background: var(--card); box-shadow: var(--shadow-4); }
.ui-prc-plan__head { align-self: end; }
.ui-prc-plan__head h2 { margin: 0; font-size: 18px; font-weight: 550; }
.ui-prc-plan__head p { margin: 4px 0 0; color: var(--muted); font-size: 14px; text-wrap: balance; }
.ui-prc-plan__price { font-size: 30px; font-weight: 600; }
.ui-prc-plan__per { margin: 0; color: var(--muted); font-size: 14px; }
.ui-prc-plan .ui-prc-plan__cta { width: 100%; }
.ui-prc-plan__list { display: grid; align-content: start; gap: 12px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.ui-prc-plan__list li { display: flex; align-items: center; gap: 8px; }
.ui-prc-plan__list li[data-lead] { font-weight: 550; }
.ui-prc-plan__list svg { width: 12px; height: 12px; flex: none; color: var(--muted); }

/* Testimonial between dotted rules */
.ui-prc-quote { margin-top: 64px; padding: 56px 0; }
.ui-prc-quote__inner { max-width: 42rem; margin: 0 auto; }
.ui-prc-quote__mark { width: 24px; height: 24px; color: var(--muted); fill: currentColor; }
.ui-prc-quote__logo { display: block; width: 64px; height: auto; margin-top: 24px; }
.ui-prc-quote blockquote { margin: 24px 0 0; font-size: clamp(20px, 2.4vw, 24px); line-height: 1.6; text-wrap: pretty; }
.ui-prc-quote blockquote::before { content: "\\201C"; margin-right: 4px; }
.ui-prc-quote blockquote::after { content: "\\201D"; margin-left: 4px; }
.ui-prc-quote__who { display: flex; align-items: center; gap: 12px; margin-top: 40px; }
.ui-prc-quote__who img { width: 40px; height: 40px; border-radius: calc(10px * var(--squircle-factor, 1)); object-fit: cover; box-shadow: var(--shadow-3); }
.ui-prc-quote__name { margin: 0; font-size: 14px; font-weight: 550; }
.ui-prc-quote__role { margin: 2px 0 0; color: var(--muted); font-size: 12px; }

/* Comparison: no lines, the rows by their height, Pro's column on a card */
.ui-prc-compare { margin-top: 64px; }
.ui-prc-compare__bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; background: var(--page); }
.ui-prc-table { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
@container ui-prc (min-width: 768px) { .ui-prc-table { grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); } }
.ui-prc-plans-cols { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.ui-prc-col__head { position: sticky; top: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 72px; background: var(--page); font-size: 14px; font-weight: 550; }
.ui-prc-col__head svg { width: 16px; height: 16px; }
.ui-prc-features__head { align-items: flex-start; justify-content: flex-end; padding: 0 24px 8px; color: var(--muted); }
.ui-prc-col[data-plan="pro"] { position: relative; z-index: 1; border-radius: calc(14px * var(--squircle-factor, 1)); background: var(--card); box-shadow: var(--shadow-4); }
.ui-prc-col[data-plan="pro"] .ui-prc-col__head { border-radius: calc(14px * var(--squircle-factor, 1)) calc(14px * var(--squircle-factor, 1)) 0 0; background: var(--card); }
@container ui-prc (max-width: 767px) { .ui-prc-col__head { display: none; } .ui-prc-features__head { display: none; } }
.ui-prc-cat { display: flex; flex-direction: column; justify-content: center; height: 56px; padding: 0 24px; }
@container ui-prc (min-width: 768px) { .ui-prc-cat { height: 112px; } }
.ui-prc-cat h3 { margin: 0; font-size: 16px; font-weight: 550; }
.ui-prc-cat p { margin: 4px -96px 0 0; color: var(--muted); font-size: 14px; text-wrap: balance; }
@container ui-prc (max-width: 767px) { .ui-prc-cat p { display: none; } }
.ui-prc-cat__space { height: 56px; }
@container ui-prc (min-width: 768px) { .ui-prc-cat__space { height: 112px; } }
.ui-prc-cell { display: flex; align-items: center; justify-content: center; height: 56px; padding: 0 24px; font-size: 14px; }
.ui-prc-feature { justify-content: flex-start; color: var(--muted); }
.ui-prc-col__action { display: flex; align-items: center; justify-content: center; height: 80px; padding: 0 16px; }
.ui-prc-col__action .ui-button { width: 100%; }
@container ui-prc (max-width: 767px) { .ui-prc-col__action { display: none; } }
.ui-prc-help { display: flex; width: 28px; height: 28px; padding: 0; border: 0; background: none; cursor: help; }
.ui-prc-help span { display: grid; place-items: center; width: 16px; height: 16px; margin: auto; border-radius: 50%; corner-shape: round; background: var(--hover); color: var(--muted); font-size: 11px; font-weight: 600; }
.ui-prc-tip { z-index: 50; max-width: 14rem; padding: 8px 12px; border-radius: calc(8px * var(--squircle-factor, 1)); background: var(--surface-5); color: var(--fluid-foreground); box-shadow: var(--shadow-5); font-size: 13px; line-height: 1.45; }
.ui-prc-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; corner-shape: round; background: var(--hover); color: var(--muted); font-size: 12px; font-weight: 600; }
.ui-prc-mark[data-checked] { background: color-mix(in oklab, var(--ev-pass, #16a34a) 14%, transparent); color: var(--ev-pass, #16a34a); }

/* FAQs: the open answer on a card, no rules between the questions */
.ui-prc-faqs { display: grid; gap: 32px; margin-top: 80px; }
@container ui-prc (min-width: 768px) { .ui-prc-faqs { grid-template-columns: 2fr 3fr; gap: 48px; } }
.ui-prc-faqs__intro { max-width: 32rem; }
.ui-prc-faqs__intro h2 { margin: 0; font-size: 36px; font-weight: 600; letter-spacing: -0.02em; }
.ui-prc-faqs__lead { margin: 16px 0 0; color: var(--muted); font-size: 18px; text-wrap: balance; }
.ui-prc-faqs__contact { margin: 24px 0 0; color: var(--muted); }
.ui-prc-faqs__contact a { color: var(--brand); font-weight: 550; }
.ui-prc-faqs__contact a:hover { text-decoration: underline; }
.ui-prc-faqs__contact--narrow { display: none; }
@container ui-prc (max-width: 767px) { .ui-prc-faqs__intro .ui-prc-faqs__contact { display: none; } .ui-prc-faqs__contact--narrow { display: block; } }
.ui-prc-faqs__groups { display: grid; gap: 48px; }
.ui-prc-faqs__groups h3 { margin: 0 0 12px; padding-left: 24px; font-size: 18px; font-weight: 600; }
.ui-prc-acc { display: grid; gap: 4px; }
.ui-prc-acc__item { border-radius: calc(14px * var(--squircle-factor, 1)); transition: background-color 200ms ease, box-shadow 200ms ease; }
.ui-prc-acc__item[data-state="open"] { background: var(--card); box-shadow: var(--shadow-3); }
.ui-prc-acc__header { display: flex; margin: 0; }
.ui-prc-acc__trigger { display: flex; flex: 1; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 24px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; font-weight: 500; text-align: left; cursor: pointer; }
.ui-prc-acc__trigger svg { width: 16px; height: 16px; flex: none; margin-top: 4px; color: var(--muted); transition: transform 200ms ease; }
.ui-prc-acc__trigger:hover svg { transform: translateY(2px); }
.ui-prc-acc__trigger[data-state="open"] svg { transform: rotate(180deg); }
.ui-prc-acc__content { overflow: hidden; }
.ui-prc-acc__content[data-state="open"] { animation: ui-prc-acc-down 220ms cubic-bezier(.16, 1, .3, 1); }
.ui-prc-acc__content[data-state="closed"] { animation: ui-prc-acc-up 180ms ease; }
.ui-prc-acc__content p { margin: 0; padding: 0 24px 18px; color: var(--muted); font-size: 16px; line-height: 1.6; }
@keyframes ui-prc-acc-down { from { height: 0; } to { height: var(--radix-accordion-content-height); } }
@keyframes ui-prc-acc-up { from { height: var(--radix-accordion-content-height); } to { height: 0; } }
@media (prefers-reduced-motion: reduce) { .ui-prc-acc__content { animation: none !important; } }
`;

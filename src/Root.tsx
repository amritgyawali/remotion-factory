import React from "react";
import { Composition } from "remotion";
import { CaseStudy } from "./templates/CaseStudy";
import { DevJoke } from "./templates/DevJoke";
import { FounderStory } from "./templates/FounderStory";
import { ListReveal } from "./templates/ListReveal";
import { SiteRoast } from "./templates/SiteRoast";
import { StatCard } from "./templates/StatCard";
import { TechTip } from "./templates/TechTip";

const FPS = 30;
const VERTICAL = { width: 1080, height: 1920, fps: FPS } as const;

// durationInSeconds comes from plan.json, so length is data, not code.
const durationFrom = ({ props }: { props: { durationInSeconds?: number } }) => ({
  durationInFrames: Math.round((props.durationInSeconds ?? 8) * FPS),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="StatCard"
      component={StatCard}
      {...VERTICAL}
      durationInFrames={8 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "Eye health, plainly",
        day: 1,
        durationInSeconds: 8,
        value: "43%",
        label: "of vision loss is preventable",
        context: ["Most of it comes down to a test", "that takes fifteen minutes."],
        kicker: "SAVE THIS",
      }}
    />

    <Composition
      id="ListReveal"
      component={ListReveal}
      {...VERTICAL}
      durationInFrames={10 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "Eye health, plainly",
        day: 2,
        durationInSeconds: 10,
        headline: "Four signs you should book an eye test",
        items: [
          "Headaches by mid-afternoon",
          "Squinting at road signs",
          "Words swimming after 20 minutes",
          "One eye doing all the work",
        ],
        kicker: "FOLLOW FOR MORE",
      }}
    />

    <Composition
      id="DevJoke"
      component={DevJoke}
      {...VERTICAL}
      durationInFrames={17 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "MERITBYTE / DEV LIFE",
        day: 1,
        durationInSeconds: 17,
        hook: "MAKE THE LOGO BIGGER",
        beats: ["Round 1 · balanced", "Round 4 · crowded", "Round 7 · the whole page"],
        punchline: "We shipped round one.",
        variant: "logo",
        kicker: "DEV LIFE",
      }}
    />

    <Composition
      id="TechTip"
      component={TechTip}
      {...VERTICAL}
      durationInFrames={20 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "MERITBYTE / QUICK WIN",
        day: 1,
        durationInSeconds: 20,
        hook: "CHECK WHAT YOUR SITE EXPOSES",
        steps: ["Test /.git/", "Test /backup.zip", "Return 403 or 404"],
        result: "Exposed files need immediate review.",
        variant: "security",
        kicker: "SAVE THIS",
      }}
    />

    <Composition
      id="SiteRoast"
      component={SiteRoast}
      {...VERTICAL}
      durationInFrames={24 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "MERITBYTE / SITE ROAST",
        day: 1,
        durationInSeconds: 24,
        hook: "YOUR CTA ARRIVED TOO LATE",
        episode: "01",
        problems: ["Slow first view", "CTA below the story", "Tap targets too small"],
        fix: "Lead with one action.",
        verdict: "Clear beats clever.",
        kicker: "ROAST 01",
      }}
    />

    <Composition
      id="CaseStudy"
      component={CaseStudy}
      {...VERTICAL}
      durationInFrames={22 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "MERITBYTE / FIELD NOTE",
        day: 1,
        durationInSeconds: 22,
        hook: "SLOW PAGES LOSE MOMENTUM",
        before: "Heavy images and blocking scripts",
        after: "A fast, focused first view",
        actions: ["Resize media", "Defer noncritical code", "Cache repeat visits"],
        lesson: "Measure first. Fix the largest wait.",
        kicker: "FIELD NOTE",
      }}
    />

    <Composition
      id="FounderStory"
      component={FounderStory}
      {...VERTICAL}
      durationInFrames={22 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "MERITBYTE / FOUNDER",
        day: 1,
        durationInSeconds: 22,
        hook: "SILENCE LOSES CLIENTS",
        moments: ["Work starts", "No update arrives", "Trust starts shrinking"],
        turn: "Send the Friday update.",
        lesson: "Communication is part of delivery.",
        kicker: "FOUNDER NOTE",
      }}
    />
  </>
);

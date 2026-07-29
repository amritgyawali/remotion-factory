import React from "react";
import { Composition } from "remotion";
import { CaseStudy } from "./templates/CaseStudy";
import { DevJoke } from "./templates/DevJoke";
import { FounderStory } from "./templates/FounderStory";
import { Recap } from "./templates/Recap";
import { ListReveal } from "./templates/ListReveal";
import { LogoLadder } from "./templates/LogoLadder";
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
    {/*
      Fixed length, and deliberately not wired to `durationFrom`. The escalation
      ladder, the freeze at 6-7s, the silence at 11-12s and the loop cut are all
      timed in seconds against a 15s body; stretching it with a prop would move
      the beats out from under the soundtrack rather than making a longer video.
    */}
    <Composition
      id="LogoLadder"
      component={LogoLadder}
      {...VERTICAL}
      durationInFrames={17 * FPS}
      defaultProps={{
        eyebrow: "MeritByte — Build Better",
        day: 1,
        durationInSeconds: 17,
        hook: "MAKE THE LOGO BIGGER",
        promise: "round 7 of 7",
        message: "perfect, can we see one more option",
        payoff: "PERFECT. Ship it.",
      }}
    />

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
    <Composition
      id="Recap"
      component={Recap}
      {...VERTICAL}
      durationInFrames={27 * FPS}
      calculateMetadata={durationFrom}
      defaultProps={{
        eyebrow: "MERITBYTE / RECAP",
        day: 30,
        durationInSeconds: 27,
        videoId: "recap-preview",
        hook: "30 days. 30 videos.",
        totals: [
          { label: "videos shipped", value: 30 },
          { label: "motion beats", value: 370 },
        ],
        leaderboard: [
          { label: "Roast my website", value: 41200 },
          { label: "It works on my machine", value: 28400 },
          { label: "Fired in four days", value: 19100 },
        ],
        lesson: "Boring consistency beat every clever idea.",
        gridCount: 30,
        kicker: "RECAP",
      }}
    />
  </>
);

import React from "react";
import { Composition } from "remotion";
import { ListReveal } from "./templates/ListReveal";
import { StatCard } from "./templates/StatCard";

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
        kicker: "FOLLOW FOR 30",
      }}
    />
  </>
);

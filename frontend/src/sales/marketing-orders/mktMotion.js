/*
  Motion presets for the Marketing Manager screens (Apple-style: springs, not fixed-duration tweens).

    SPRING        critically damped (no overshoot): the default for everything that just moves into place
    SPRING_SOFT   same, a little slower: for big surfaces (hero, banners, bars filling)
    SPRING_PRESS  very short: the feedback when a finger / pointer goes DOWN on something
    SPRING_POP    a touch of bounce: only for things that "arrive" with intent (the floating New order button)

  Pages wrap themselves in <MotionConfig reducedMotion="user">, so people who ask their OS for less motion
  get the same layout with fades only.
*/

export const SPRING = { type: "spring", duration: 0.4, bounce: 0 }
export const SPRING_SOFT = { type: "spring", duration: 0.55, bounce: 0 }
export const SPRING_PRESS = { type: "spring", duration: 0.18, bounce: 0 }
export const SPRING_POP = { type: "spring", duration: 0.5, bounce: 0.22 }

/* whileTap values: respond on pointer-DOWN, not on release */
export const PRESS = { scale: 0.96, transition: SPRING_PRESS }
export const PRESS_SOFT = { scale: 0.985, transition: SPRING_PRESS }

/* Parent + children: <motion.div variants={stagger()} initial="hidden" animate="show"> <motion.div variants={rise}/> */
export const stagger = (gap = 0.05, start = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: start } },
})
export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: SPRING },
}

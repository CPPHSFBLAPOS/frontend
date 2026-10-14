import type { Transition, Variants } from 'motion/react';

// One set of motion presets so the whole app moves the same way: quick,
// springy, never in the way. MotionConfig reducedMotion="user" (in App)
// turns transforms off for people who ask their OS for less motion.

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 28 };
export const snappy: Transition = { type: 'spring', stiffness: 700, damping: 38 };

export const page: Variants = {
  initial: { opacity: 0, y: 10, filter: 'blur(2px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -6, filter: 'blur(2px)', transition: { duration: 0.16, ease: 'easeIn' } },
};

export const list: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};

export const item: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: softSpring },
};

export const pop: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.12 } },
};

export const shake = {
  x: [0, -10, 9, -7, 5, -3, 0],
  transition: { duration: 0.42 },
};

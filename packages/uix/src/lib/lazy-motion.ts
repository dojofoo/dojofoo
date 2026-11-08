/** Keep animation features out of the static page's initial JavaScript. */
export const loadMotionFeatures = () => import("./motion-features").then(module => module.default);

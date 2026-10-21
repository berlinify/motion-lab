import { Circle, makeScene2D } from "@motion-canvas/2d";
import { all, createRef } from "@motion-canvas/core";

export default makeScene2D(function* (view) {
  const circle = createRef<Circle>();
  view.add(<Circle ref={circle} size={160} fill="#6c5ce7" />);
  yield* all(circle().scale(2, 1).to(1, 1), circle().fill("#00cec9", 1).to("#6c5ce7", 1));
});

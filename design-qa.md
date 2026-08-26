# Design QA — 无引导的长按聚拢交互

- Existing mobile prototype source: current `/batch-place` implementation and supplied mobile layout references
- Intended viewport: 393 × 852 CSS px
- Target state: the picker is interactive on page load with no onboarding overlay; a stationary 500 ms press gathers the current selection and gives a short haptic pulse when supported

## Static fidelity

- The expanded five-column picker, selected-piece purple check/outline treatment, two-layer carried aggregate, and red-line boundary direction remain unchanged.
- No guide asset, prompt, overlay, hand, or arrow is mounted in the batch-placement route.

## Interaction checks completed

- Source inspection confirms the picker is interactive on every fresh page load and no guide state is created.
- All picker pieces remain tappable; a stationary press is eligible after 500 ms and movement before that threshold cancels pickup.
- The real gather animation is the only pickup feedback, with a short vibration request at the successful pickup moment.
- All gesture, boundary, build, and Sites packaging tests pass.

## Verification blocker

- A fresh browser-rendered capture and timed interaction run could not be completed: the in-app browser timed out while loading the local mobile preview and reset its control session.
- Because the timed hand path could not be captured at the same viewport, visual interaction QA cannot be marked passed from source inspection and build checks alone.

## Findings

- P0/P1/P2 visual findings cannot be assessed without a fresh rendered animation capture.
- Hand size, fingertip alignment, and pacing still need confirmation on the user's phone after publishing.

final result: blocked

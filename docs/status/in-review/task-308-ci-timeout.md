status: Task 308, CI browser-test job limit raised from 15 to 25 minutes (#648 follow-up): on busy runners the build step alone took 9-10 minutes, so whole parts were cancelled at the limit without any test failing.
decision: D-pending (Task 308): keep 25 minutes until a shared one-time build (build once, reuse in every part) is added, then lower it again.

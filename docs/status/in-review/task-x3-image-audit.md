status: in review. Every img in src has alt, width, height and a loading attribute; a unit test guards it.

Fixed: ShareSheet previews and ResultBrandMark emblems now load lazily; LessonVideo thumbnail gets width and height.
Not touched (rules): SignIn and TwoFactor (auth). AnatomyLab worksheet picture still has no lazy loading because open PR #684 edits that file.

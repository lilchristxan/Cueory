status: Adds a versioned on-device study progress shape and a pure migration. It does not write local storage, infer recall from legacy piles, or send progress anywhere.
decision: Confirm the export, reset and disclosure behavior before connecting this payload to existing browser progress.
The standard build and unit tests passed. During the browser suite the shared pinned Playwright browser directory ceased to exist, and new Chromium workers could not launch. Full browser verification remains open.

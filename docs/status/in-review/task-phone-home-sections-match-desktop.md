status: in review. Home page below the hero now follows the desktop design on phones (vial shelf, games carousel, signup panel, section spacing).

- Vial shelf (phone): five smaller vials on the same shelf, 44 px arrows at its left and right ends, dots under it and one readable line naming the front vial (the small bottle labels stay as decoration).
- Games carousel (phone): the desktop card (280 x 392, status at the foot), a clear peek of the next card, arrows beside "play today's".
- Games section (all sizes): comes before the vial section as on the final board, heading centred with the arrows at its two ends, copper-disc arrows, and a dot pager under the cards (8 px dots 16 px apart, current one a 26 x 8 px pill; real buttons with a 44 x 44 hit area; follows arrows, swipe and keys). Phones also close the gap between cards (new token --game-track-gap-phone) so 48 px of the next card really shows.
- Signup panel and sections: centered on phones, one 64 px gap between sections (new token --spacing-section-phone), headings 33 px (new token --text-title-phone).
decision: D-pending: phones show a one-line caption under the vial dots. It names the front vial, which the 2026-11-02 "no caption that only restates the label" note had ruled out; phones need it because the bottle labels are too small to read at five across.
- Needs Christian: nothing. Footer link sizes (footer component) and the explore panel (hero) are outside this change.
- decision: D-pending: the games dot pager keeps 8 px dots but 16 px apart (Christian's reading was 8 px apart). At 16 px pitch the 24 px target-size rule (axe, WCAG 2.5.8) fails; 24 px between centres passes. Hit area is 44 px tall and 24 px wide, since 44 px wide boxes would overlap and steal each other's taps.

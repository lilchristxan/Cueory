# Manual screen reader walkthrough, x5: home, a lesson, pillo

Report only (lane 12). A script for a person to run with VoiceOver before launch, so we hear what a blind student
hears. Automated checks (axe, the keyboard specs) cannot judge whether the order and wording make sense; this does.

The "you should hear" lines come from the browser's accessibility tree on `staging` at `31e2b3e` (2026-11-19, read with
Playwright's ARIA snapshot at 1440 px). VoiceOver's exact words differ a little by version (for example "link, start
studying for free" or "start studying for free, link"), so match the meaning, not the wording. Anything marked **Check**
is a spot where the tree already looks odd and a person should decide.

## Before you start

| | Mac (Safari) | iPhone (Safari) |
| --- | --- | --- |
| Turn VoiceOver on and off | Command + F5 (or triple-press Touch ID) | Settings > Accessibility > VoiceOver, or triple-click the side button if set up |
| Next / previous item | VO + Right / Left arrow (VO = Control + Option) | swipe right / left with one finger |
| Next heading | VO + Command + H | rotor to "Headings" (twist two fingers), then swipe down |
| Rotor (lists of headings, links, landmarks, form controls) | VO + U, then Left/Right to switch lists | twist two fingers |
| Press the current item | VO + Space | double-tap |
| Move by keyboard only | Tab / Shift + Tab, Enter, Space, Escape | (with a Bluetooth keyboard) the same |
| Stop speech | Control | two-finger tap |

Set up for each run:

1. Use a private window, so no saved theme, promo or progress changes what you hear.
2. Run each page twice: once with VO + arrows (reading order), once with Tab only (keyboard order).
3. Run once in Light and once in Dark (footer: show footer links > theme). The words should not change.
4. Write down, per step: pass, or what you heard instead. Note the device, OS and Safari version.
5. If the "get launch updates" pop-up or the promo panel appears part-way, note when, close it with Escape, and check
   focus went back to where you were.

## 1. Home (`/`)

**Landmarks first.** Open the rotor (VO + U) and pick Landmarks. You should find: banner, navigation "main" (desktop
width only), main, the regions inside main, and content info (the footer).

| Step | Do | You should hear (roughly) |
| --- | --- | --- |
| 1.1 | Load the page, VO + Right once | "link, skip to content" |
| 1.2 | Press it (VO + Space) | Focus jumps into main; the next item is the "by nursing students, for nursing students" line |
| 1.3 | Reload. Read on with VO + Right | "we're still building. more coming soon." (a note), then the banner: "open site menu, button" |
| 1.4 | Continue (desktop width) | navigation "main": "study", "games", "support" links, then "about" (a group that opens a list) |
| 1.5 | Continue | "search the site, button", "open account menu, button" |
| 1.6 | VO + Command + H | "heading level 1, nursing school made simpler." |
| 1.7 | Read the hero | "start studying for free, link"; list "what you get", 2 items: "structured learning, from basics to med-surg" and "multiple ways to study, learn the way that works for you" |
| 1.8 | Continue | The Ko-fi link reads its whole card and ends with "(opens in a new tab)". **Check:** it is long (about 30 words). Does it still make sense as one link? |
| 1.9 | Continue | navigation "start with what you need.", "EXPLORE", heading level 2, then 4 links: lessons, study materials, daily games, give us suggestions |
| 1.10 | Next heading | "how it works", level 2, then 3 level-3 headings: pick a lesson, study it your way, come back to what you're still learning; then "start with a lesson, link" |
| 1.11 | Next heading | "ways to study", level 2, "one lesson, eleven ways in", group "study mode cards" |
| 1.12 | Move through the cards | Each card is a group "N of 11" with a button ("preview video", "show cards" ...), a level-3 heading and "best for ..., about N minutes". **Check:** the tree goes from "5 of 11" to "8 of 11"; 6 and 7 were not in it. Find out whether they are hidden on purpose (and if so, whether "of 11" should count them). |
| 1.13 | Press "show cards" | A dialog opens; VoiceOver says its title. Focus is inside it. Read it through, then press Escape: the dialog closes and focus is back on "show cards" |
| 1.14 | Continue past the cards | "previous study mode", "next study mode", "pause the slideshow" buttons. Press pause: it should say it is paused (the name or state changes). **Check:** an empty paragraph follows; it should say nothing |
| 1.15 | Next heading | "daily games", level 2, today's puzzles line, today's date line, "play today's games, link" |
| 1.16 | Next heading | "get launch updates", level 2, "email address, edit text", "sign up, button", the Kit/privacy sentence with "privacy page, link" |
| 1.17 | Press "sign up" with the field empty | An error is read out right away, and focus stays in or returns to the field |
| 1.18 | Footer | "flag or comment, button", "cueory, home, link", "show footer links, button". Press the last: it says expanded, and the links and theme picker follow it |

Keyboard-only pass (Tab from the top): skip link, ☰, the main navigation links, about, search, account, then the
hero link. Every stop shows a visible focus ring. Nothing on the page is reachable by mouse only.

## 2. A lesson (`/learn/study-skills`, then its cards)

This is the sample lesson; its text is placeholder on purpose. Listen for structure, not content.

| Step | Do | You should hear (roughly) |
| --- | --- | --- |
| 2.1 | Load, read from the top | "skip to content, link", the building note, banner: "open site menu, button", "Cueory home, link", "open account menu, button". No main navigation here (study screens stay plain). **Check:** this link says "Cueory home"; the footer link says "cueory, home". Pick one wording |
| 2.2 | Next heading | "heading level 1, Lesson 1: How to study for nursing school", after the line "how to study for nursing school · lesson 1" |
| 2.3 | Continue | The placeholder notes, then "choose how to study", level 2, "seven ways to practice this lesson." |
| 2.4 | Continue | List "ways to study this lesson", 7 items. Each item: a level-3 heading (cards, learn, matching, organizer, fill-in, label it, questions), a "more about ..." button, and a link that says what it does ("practice this lesson with cards") |
| 2.5 | Press "more about cards" | It says expanded and the description follows it. Press again or Escape: collapsed, focus stays on the button |
| 2.6 | Next heading | "read the lesson", level 2. One sentence, then "sentence 1 of 3", "back, dimmed button", "next sentence, button", "show all, button" |
| 2.7 | Press "next sentence" | The new sentence is read without moving focus off the button, and the count says "sentence 2 of 3"; "back" is no longer dimmed |
| 2.8 | Continue | The samples/placeholders note and "disclaimer, link", then the footer as in 1.18 |
| 2.9 | Follow "practice this lesson with cards" | New page. Heading level 1 "Lesson 1 cards" |
| 2.10 | Read on | group "Study options": "Shuffle, checkbox", "Only starred cards (0), dimmed checkbox". **Check:** each checkbox's label is also read again as plain text right after it; it should be read once |
| 2.11 | Continue | region "Question", the front of the card, a progress bar "Cards in this round", "Card 1 of 3 · Know it: 0 · Still learning: 0" |
| 2.12 | Press "Show answer" | The back of the card is read out. The button's name changes (for example to "show question"), and "know it" / "still learning" choices appear and can be reached next |
| 2.13 | Mark "know it" | The count line updates and is announced ("Know it: 1") |
| 2.14 | Keyboard pass | Space flips, ← → move, 1 and 2 sort, S stars, as the keys hint says. "Hide the keys hint" hides it and focus stays sensible |
| 2.15 | Continue | "Your piles and stars are saved in this browser only." with "See or clear them, link"; then 2 links: learn mode, back to the lesson |

## 3. pillo (`/play/pillo`)

| Step | Do | You should hear (roughly) |
| --- | --- | --- |
| 3.1 | Load, next heading | "heading level 1, pillo", then "today's puzzle", level 2, after the links "all games" and "flag or comment on pillo". **Check:** "flag or comment on pillo" is an email link here, and the footer has a "flag or comment" button too. Is one flag enough? |
| 3.2 | Continue | region "pillo": "pillo settings, button", "how to play pillo, button", "guess the 5-letter word · 6 of 6 guesses left" |
| 3.3 | First visit only | region "new to pillo? here's how to play" with a level-3 heading, a sentence, a list "what the marks mean" (● in its place, ○ in the word somewhere else, · not in the word), six rules, and "got it, button". **Check:** does VoiceOver read ● ○ · as words ("black circle", "white circle", "middle dot")? The words after each make it clear either way |
| 3.4 | Press "got it" | The rules go away and focus lands on something sensible (the guess field), not the top of the page |
| 3.5 | Continue | list "your guesses" (empty: VoiceOver may say "list, 0 items"), then "your guess, edit text", the hint "type a 5-letter word and press enter, or tap the letters below." |
| 3.6 | Type a real 5-letter word and press Enter | The result is announced without moving focus: each letter with its mark in words (in place, elsewhere, not in the word), and the guesses left goes to 5 of 6 |
| 3.7 | Type a word that is not in the list | It is announced as not in the word list, and the guesses left stays the same |
| 3.8 | Use the on-screen letters | group "letters": buttons a to z, "delete", "enter". After a guess each letter key also says its mark |
| 3.9 | Open "how to play pillo", then Escape | A dialog with the rules; focus starts inside it and stays there with Tab; Escape closes it and focus is back on "how to play pillo" |
| 3.10 | Open "pillo settings", then Escape | Same as 3.9, back on "pillo settings". Each setting says its state (on/off) |
| 3.11 | Finish the game (win or use up the guesses) | The result is announced, the share line and the time to the next word can be reached and read; nothing traps focus |
| 3.12 | Next heading | "your stats", level 2; after a game, the pillo stats are read as words, not only as a chart |

## When you find a problem

Use the site's own "flag or comment" (or tell Claude in chat) with: the page, the step number, what you did, what you
heard, and what you expected. Steps marked **Check** need a decision even if VoiceOver reads them; collect those for
one pass at the end.

# Video lessons: one board file per video

Christian's plan (2026-11-26): the pictures in a teaching video become the label-it version at once, and the
transcript becomes everything else. The video script already knows every label's word and place and every spoken
clause, so it writes one **lesson board** file and the site reads only that. Nothing is typed twice.

| From the video | Becomes | Through |
| --- | --- | --- |
| Each finished picture with its written labels | label it (one set per picture) | `boardLabelSets` |
| Each spoken clause that teaches one fact | cards, learn, matching, fill in, questions | `boardRows` |
| Wrong choices for a question | other answers from the same lesson | `wrongChoices` |

Code: `src/lessons/board.ts`. Labeled sample: `content/samples/templates/lesson-board.json`. Tests:
`tests/unit/lesson-board.test.ts`.

## The file

```json
{
  "id": "sample-house",
  "lesson": "study-skills-01",
  "status": "sample",
  "title": "the parts of a house (everyday sample)",
  "pictures": [
    { "id": "house", "image": { "src": "…", "alt": "…", "width": 800, "height": 600, "credit": "…" },
      "labels": [{ "id": "roof", "text": "roof", "x": 42, "y": 5, "w": 16, "h": 7.5,
        "lo": "classify-sample-information", "bloom": "remember", "level": 1, "anchor": "sample-video" }] }
  ],
  "clauses": [
    { "id": "c1", "said": "The roof covers the top of the house.",
      "question": "What covers the top of the house?", "answer": "roof", "label": "roof",
      "lo": "classify-sample-information", "bloom": "remember", "level": 1, "anchor": "sample-video" },
    { "id": "c5", "said": "That is the whole house." }
  ]
}
```

- `pictures[].labels`: `x`, `y`, `w`, `h` are percentages of the picture, the box that covers the written word.
- `clauses[].said`: the clause exactly as narrated. `question` and `answer` come from the reviewed script and are
  given together or not at all. `label` names the label this clause writes; every label must be written by a clause.
- `status`: `sample`, `draft` or `approved`. Only an approved board may reach a public lesson.

For a module path board, tag each study clause and picture label with four fields. `lo` names the lesson objective.
`bloom` records the thinking this particular item requires (remember, understand, apply, analyze or evaluate).
`level` records its difficulty from 1 to 3. `anchor` names one of that objective's teaching segments.
Narration without an activity needs no study tags. The [labeled module manifest](../content/samples/module-path/study-skills.json)
points to an existing placeholder reading sentence and an illustrative time range for the placeholder video.
These source IDs let us test the connections before reviewed teaching material is available.

## Rules

- Label names, questions and answers come from Christian's reviewed content batches, never from AI. The converters
  only rearrange what the file holds.
- A fill-in sentence is the spoken clause with the answer left out; when the clause does not say the answer, that row
  has no fill-in sentence.
- Pictures from Servier Medical Art follow [VISUALS.md](VISUALS.md): files from Servier's own site, a record per
  file, and the "adapted" credit once a picture is cropped or labelled.
- Real boards hold lesson content, so they live in the private content store and the database until approved; this
  repository holds only the labeled sample.

## Not built yet

The study pages still read their own sample files. Wiring a board into the label-it page and the other modes comes
with the first approved board.

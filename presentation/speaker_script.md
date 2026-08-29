# Dédalo for curators — speaker script

Companion to `dedalo_for_curators.pptx` (the same text is embedded as notes). 16 slides, ~2,700 words ≈ 21 min of talk — leaves ~10 min for questions and the live look. Slides 5, 7, 13 and 14 carry the argument; if pressed for time, skim 9 and 11.

## Slide 1 — Dédalo — the living catalogue of your collection

Welcome, and thank you for the half hour you're giving us.

Dédalo is a system for managing cultural heritage — collections, inventories,
archives, oral testimony. Coins and amphorae, interviews and photographs,
places and people.

I promise you two things today. First: no code. Not one line. Everything I
show will be about your work — cataloguing, researching, publishing — and not
about servers. Second: by the end, you'll be able to explain what Dédalo is,
and why it is different from the catalogue software you've met before, in
about three sentences.

The name is Dédalo — Daedalus, the craftsman. Keep that image in mind: not a
box that stores things, but a workshop that shapes them.

Let's begin with an uncomfortable question: why does the heritage field keep
producing new software, when there is already so much of it?

## Slide 2 — Heritage software usually fails in one of two ways

Software for cultural heritage tends to fail in one of two ways, and most of
us have been burned by both.

The first failure is the pretty spreadsheet. It's wonderful on day one.
Everyone adds columns differently, every volunteer types dates their own way.
After three years nobody is sure which file is the real one, and the person
who understands it has left the institution. Fast to start — impossible to
keep coherent.

The second failure is the rigid database. Someone who has never held an
amphora designed its tables. It is well behaved, and completely inflexible:
you need one extra field for a new project, and that small human request
becomes a ticket, a developer, a budget, a release, a delay. A project to
change something that should take a minute.

Notice what both failures have in common: the shape of your catalogue is not
in your hands. Either it's in nobody's hands, or it's in a programmer's
hands. Hold that thought — because Dédalo's central idea is precisely to give
that shape back to you.

## Slide 3 — It exists to do three things

So what is Dédalo? Strip away everything else and it has exactly three jobs.

One — produce good data. Not "data", good data: structured, consistent,
linked to each other, written in every language your institution works in.
This is the quiet, unglamorous heart of the whole project.

Two — keep it for decades. A collection outlives spreadsheets, outlives
staff, outlives software vendors. Dédalo keeps every version of every record
with its author and its date, so the catalogue is still trustworthy — and
still explainable — in thirty years.

Three — publish what should be public. Cataloguing and publishing are two
different acts, and Dédalo never confuses them. What goes out to the world is
a deliberate decision, taken record by record.

Notice what is NOT on this list: Dédalo is not a website builder, and it's
not a generic content manager. Your website will talk to Dédalo — but
Dédalo's job is the collection itself: its quality, its memory, its safety.

## Slide 4 — One system, two rooms

Here is the shape of the whole thing, and the museum analogy is the project's
own. Dédalo is two rooms.

Behind, the workshop. Your team works there on your own network — you do not
even need the internet to catalogue. It holds the catalogue itself: every
record, every image, every version. This is the original, and the only
original there is. It never faces the internet.

In front, the gallery. That's your public website, partners, researchers —
even AI assistants. What they see is a published copy: flattened, read-only,
sitting on a different machine.

Data flows one way: workshop to gallery. There is no route back in. The
public door has no handle on the inside — it can hand things out, but it
structurally cannot write anything, anywhere.

This one design decision answers most of the scary questions. If the public
site is attacked or goes down, cataloguing continues untouched. If your
network is down, the website keeps serving. And nothing — nothing — is ever
public by accident.

## Slide 5 — The shape of your catalogue is data

Now the central idea. If you remember one thing from today, make it this one.

In almost every system, the shape of the catalogue — which kinds of records
exist, which fields they have, in what order, with which vocabularies —
lives inside the program. Change the shape, and you change the program:
developer, release, budget, delay.

In Dédalo, the shape of the catalogue is itself data. It lives in something
called the ontology — think of it as the catalogue's constitution — and you
edit it inside Dédalo, like anything else. Adding a field, creating a whole
new kind of record, making a text box into a controlled vocabulary,
reordering a form: these become acts of documentation, not programming.

Why does this matter to an institution? Because your descriptive model can
follow your discipline instead of the software's assumptions — and it can
evolve. A modest inventory can grow into a full scientific catalogue without
rebuilding anything. A standard changes? You update the model yourself.

One honest caveat: the power moves to whoever designs your model. The design
deserves the same care as a cataloguing manual. Dédalo stops the software
imposing a bad model on you — it can't stop you designing one.

## Slide 6 — Every object gets a complete page

Let's stand in the workshop for a minute and look over a cataloguer's
shoulder.

This is a record — one coin. Above it, its section: the kind of record it is.
Coins is a section. Oral testimonies is a section. People, places, excavation
sites — sections. If you're an archivist, think "series"; if you've met
databases, think "table", but a table that can be re-shaped by you.

Inside the record are components — fields, but fields that understand their
kind. The date component understands imperfect dates — "before 100 BC,
probably". The geographic component understands points and areas. The media
component knows a file has a master, derivatives and a thumbnail. The
relation component knows its content is a pointer to another record, not a
piece of text.

You'll notice tabs at the top: CA, ES, EN — we'll come to languages shortly.

And remember the last slide: every element of this form — which fields exist,
their order, their vocabularies — was designed by the institution, not
imposed by a programmer. This page is yours.

## Slide 7 — Correct once, right everywhere

This slide is the single biggest difference between a catalogue and a
spreadsheet.

When a record mentions a place in a spreadsheet, you type the string "Vall de
Cabó". Nine hundred records, nine hundred copies of the name. One typo, one
reform of the toponym, one clerical error — and you have nine hundred little
problems.

Dédalo never copies names. It stores a pointer. "Vall de Cabó" is not a
string repeated everywhere — it is one record, with its own description,
variants and history, and nine hundred records point at it.

Three consequences, and they're the ones every documentalist has wanted
forever. Correct once: fix the term, and every record is right, immediately,
everywhere. Ask backwards: because the link is real, you can ask "which
testimonies mention this person?" or "what came from this excavation?" —
questions nobody planned in advance. No drift: two records cannot disagree
about a spelling they don't hold.

Links, not copies. It sounds small. It is the whole difference between a list
and a network of knowledge.

## Slide 8 — Words that mean something

Links need something to link to — and that brings us to vocabularies.

A thesaurus in Dédalo is a tree of terms: places, personal names, subjects,
materials, techniques, typologies. Controlled vocabulary means: when nine
cataloguers write "the Iron Age", they all reach for the same node — not nine
slightly different strings.

The important part is subtle: the terms in the tree are ordinary records.
Remember the previous slide — a pointer, not a copy? The term record itself
can be described, dated, translated, cited. Your toponymic thesaurus entry for
a valley can carry its coordinates, its alternative names through history,
its translations. It is documented as carefully as any museum object,
because in Dédalo it is one.

And because vocabularies are yours — remember, the shape of the catalogue is
data — when a new controlled vocabulary appears in your discipline, or a
national aggregator imposes one, adopting it is a documentation task you
perform, not a feature request you file.

Words that mean something, agreed once, used everywhere.

## Slide 9 — Every value, in every language

Multilingual is a word institutions use loosely, so let's be precise. In a
heritage system, two different things get translated, and confusing them
causes endless trouble.

First, the data. A title, a description, an abstract can exist in as many
languages as your institution works in — each version stored separately, on
the same record. The four lines you see here are one field, one record, four
languages. A researcher reads in English; a volunteer enters in Catalan; both
see the same object.

Second, the interface — the buttons, menus and field labels your staff see.
That translates too, independently. A translation workflow can run over your
data without ever touching the program.

And note what deliberately does NOT translate: the inventory number, a
coordinate, a year. Those are the same in every language, and Dédalo knows
the difference — one more consequence of fields that understand their kind.

For heritage data in particular — small languages, cross-border research,
diaspora audiences — this isn't a checkbox feature. It's how a collection
speaks to everyone it belongs to.

## Slide 10 — Nothing is silently lost

Every cataloguer has lived the moment: someone changed a description, and
nobody knows what it said before, or why.

In Dédalo, nothing is silently lost. Every change to a record is kept — what
it was, who made the change, and when. The tool is called the time machine,
and it does exactly what it says: you open a record and read its biography,
version by version, and you can restore any earlier state.

For a scientific catalogue this is not a comfort feature. Think what it
actually guarantees. An attribution is defensible — you can show the evidence
as it stood on the day you made the call. A correction is traceable — you can
prove you fixed it, and when. A disputed record is reconstructible — even
after a bad bulk change by a tired intern.

And there's a human consequence that matters as much: you can hand a
collection to a colleague — a successor, a partner institution — and they
receive not just the answers but the reasoning that produced them.

Twenty years of decisions, kept. That's what "for decades" meant on slide
three.

## Slide 11 — Files are handled like heritage

Heritage collections are no longer just text. Photographs, recordings, film,
scanned documents — and Dédalo treats files the way a conservation lab treats
objects, not the way an email client treats attachments.

When you upload something, it becomes the master — the conserved original.
Dédalo never alters it. Ever. Everything the interface needs — smaller
versions, thumbnails, formats for the web — are generated as derivatives
beside it. The original stays exactly as you deposited it, thirty years from
now.

For oral history there's a second layer: recordings can be transcribed and
indexed, so that a passage — with its timecode — becomes a citable unit. A
researcher doesn't cite "interview 204, somewhere around minute twelve".
They cite 12:34, and the system takes them there. Long texts work the same
way with page references.

And scale: large files are served directly by the web server rather than
carried through the program, which is why a multi-gigabyte video is an
ordinary record, not an incident.

The principle is conservation: handle bytes like heritage.

## Slide 12 — Publication is a decision

We've built good data, in private, in the workshop. Now: the world. And the
governing principle is that publication is a decision — never an accident.

There is no "make the archive public" switch in Dédalo. You mark records for
publication, one by one. A background job then copies the marked records out
into the public database, and writes whatever file formats your partners and
aggregators want — CSV, XML, RDF. The job runs on its own, and if it's
interrupted, it resumes where it stopped.

Three properties to notice. Per record: what you didn't mark simply doesn't
exist out there. Reversible: un-mark a record and the next run removes it —
taking something down is as easy as putting it up. And per field: a record can
be public while parts of it aren't — the donor's name, a sensitive location,
personal data of living people, testimony given under condition.

Why does this design matter? Because it's what lets you catalogue frankly —
with internal notes and unresolved attributions — and still publish
confidently. A collection can be catalogued for years and published in one
afternoon.

## Slide 13 — Three doors, one lock

You'll hear the word "API" in every technical conversation about Dédalo. An
API is simply a door other programs may knock on. Dédalo has three, and this
slide is really about trust.

The staff door: your team, each with a personal account, doing everything
their permissions allow. And permissions are granular — per section, per
field. A volunteer can catalogue physical descriptions while never seeing the
donor's name. That's not a policy you hope people follow; it's the shape of
the system.

The public door: your website and the world. It reads the published copy and
it can only hand things out — the door has no handle on the inside.

The AI door: an assistant can search and read — seeing exactly what its user
sees, never more — and when it wants to change something, it writes a plan,
op by op, that a human confirms. It cannot save on its own.

Now the point directors care about: three doors, one lock. Whoever knocks —
person, website, or assistant — passes the same checks, in the same order,
against the same permissions. No back doors, no shortcuts. Opening the AI
door does not open anything else.

## Slide 14 — Ready for AI, on your terms

Two AI pieces are built into Dédalo. Both are optional, both are off until
your administrator says otherwise — and both are shaped for heritage work.

First: semantic search — finding things by what they mean, not by exact
words. A researcher asks about people displaced by a dam. Word search finds
only records where someone wrote "dam". Dédalo also finds "when the water
came and we had to leave", "el pantano", "they flooded our village" — because
those mean almost the same thing. And every result cites the record it came
from, so a researcher can open it and judge for themselves.

Why does heritage need this more than most data? Because heritage data is
multilingual, historical, dialectal, paraphrastic — testimony spoken in 1960s
vocabulary simply doesn't contain the researcher's keywords.

Note what it does not replace: precise field search stays — "every coin
minted before 100 BC" is still exact. Meaning is an additional door.

Second: AI assistants plug in through the door we saw last slide. It asks
Dédalo — never the other way round. It sees only what its user sees. And it
proposes; a person decides. Sensitive collections can be excluded entirely,
or run against a local model so nothing leaves the building.

## Slide 15 — Twenty years in the field, open by design

Why should an institution trust this with its memory? Four reasons.

It is in production, today, in the field — not a prototype looking for users.
Numismatic catalogues in Spain, ethnological collections in València, oral
memory archives from the Spanish Civil War, archaeological and exhumation
records, research at the Freie Universität Berlin. Coins and testimony,
twenty years of accumulated practice.

It is free and open source. No licence fees, no vendor who can disappear or
reprice you, no format held hostage. The code is there to be read — which,
for an institution whose duty is preservation, is itself a preservation
strategy.

Your data is yours, in PostgreSQL, and it speaks the open languages of the
field: RDF, Dublin Core, JSON-LD, CSV, XML. Aggregators and partners can
harvest it through the public door on standard terms.

And quality is measurable: Dédalo carries a score called Raspa — zero to ten,
from "structured" up through "traceable, translatable, openly processable".
Useful for arguing with evidence in a funding application.

Last line: in 2026 the engine behind it was completely rebuilt — and not one
record, not one byte of anyone's data was touched. That's the durability test
it chose to pass.

## Slide 16 — Memory, kept alive

Let's close the way the project's own manual closes, with three things to
remember.

One: your catalogue is private, and it is the original. What the public sees
is a copy, on a different machine, that can only be read. Nothing is public
by accident.

Two: the shape of the catalogue is yours. Fields, record types and
vocabularies are data you edit inside Dédalo — not code somebody has to
rewrite for you. Your model can follow your discipline, and evolve with it.

Three: nothing is published or changed silently. Publication is a decision,
record by record, and every edit ever made is kept, with its author and its
date.

That's the whole story, really: produce good data, keep it for decades,
publish by decision — in a workshop whose shape belongs to the people who
know the collection.

Thank you. The demo is live and open — let's go look at a real catalogue and
see the time machine and the thesaurus in action, and I'll take your
questions while we do it.


# predicate-disclosure

The design needs only "over 18", but the whole age is disclosed. This is a declared disclosure, so it fails only against the privacy spec, which says age is hidden and only the fact may be revealed. Fix: `disclose(holder_age() >= 18)`.

See the design guide: `docs/design-guide.md`.

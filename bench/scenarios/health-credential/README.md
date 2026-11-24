# health-credential

The worked example of the design guide: a health credential that reveals only "18 or over". The fixed version follows the design proposal (commitment with a nonce, issuer-only issuance, fact-only disclosure). The holed version hides the claim with a plain hash, the mistake seen in a hackathon project; the engine recovers age and condition code (A2, criteria 4 and 5).

Walkthrough: `docs/design-guide/walkthrough-health-credential.md`.

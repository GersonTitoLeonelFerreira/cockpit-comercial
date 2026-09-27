# Companion session identity — final live validation

Temporary branch created from `af5568a79083b1dc4d5255438b36111bd076e5d2`.

Purpose:
- obtain an isolated Vercel Preview for the Bearer-based identity rehydration;
- validate stale cached sessions in WhatsApp and ManyChat without touching production;
- validate the user-first header with the canonical company name;
- keep production untouched.

This branch is temporary validation infrastructure and must not be merged.


## Final Preview routing

Preview: `https://cockpit-comercial-vocn-git-claude-companion-sessio-35a10b-yolen.vercel.app`

This temporary branch:
- forces /companion/connect to stamp the exact Preview origin into the session;
- allows the E2E extension transport to call that Preview;
- allows Bearer GET /api/companion/me identity rehydration against that Preview;
- ignores production SESSION_UPDATE while the Preview session is cached;
- leaves production untouched.

# ID-01 — Live validation window

Temporary branch created from `3348d774e084304bbe5030c8658285c76428d508`.

Purpose:
- obtain an isolated Vercel Preview alias;
- route only the E2E validation build to that Preview;
- verify that the active company name remains correct after GET_ME refresh and conversation changes on WhatsApp and ManyChat;
- keep production untouched.

This branch is temporary validation infrastructure and is not intended for merge.


## Validation routing diagnosis

The first Preview-generated hash session carried the correct company name, but production dashboard tabs keep publishing a production SESSION_UPDATE every 15 seconds through the installed bridge. That production session can overwrite the Preview session in extension storage.

This temporary branch therefore:
- gives the Preview connection session its real Preview origin;
- authorizes exactly this Preview origin in the E2E extension transport;
- ignores production bridge SESSION_UPDATE only while a valid Preview session is already cached;
- leaves the production branch untouched.

Preview: `https://cockpit-comercial-vocn-git-claude-companion-id-01-9d3d8a-yolen.vercel.app`

# FNC-02 — Live performance window

Temporary branch for isolated Vercel Preview measurement.

Base: `6f736467c61357c5b5306d591b3c09b6ae5d8690`

Purpose:
- route only the E2E live test to this branch Preview;
- measure `queue_wait_ms`, `processing_ms` and `total_ms`;
- keep production untouched;
- remove temporary routing after measurement.

No production rollout, merge or release is authorized by this file.

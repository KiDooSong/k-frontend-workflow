# Ambiguity Triage

Consumer reference for deciding whether uncertainty should stay as an Unknown, become an Open Decision candidate, or stop implementation for human review. This is guidance for agents and reviewers; it is not a script gate.

## Rules

- Only readiness and validate are gates. This document never creates an exit 1 condition.
- Agents may propose Unknown/Open Decision candidates, but people resolve decisions, close Unknowns, and promote candidate facts to confirmed.
- Use the lowest blocking mode that would be unsafe without the answer.
- If the ambiguity changes structure, state sets, API shape, routing, or UX direction, propose an Open Decision candidate.
- If the ambiguity is a single discoverable fact and the work is cheap to correct, keep it as an Unknown candidate.

## Safe To Proceed

Evaluate modes from low to high and stop before the first unsafe mode. Never use this table to exceed the readiness mode.

| Mode | Stop when unresolved ambiguity affects |
|---|---|
| docs-only | never; document the ambiguity |
| route-skeleton | navigation-map or route existence |
| screen-skeleton | screen existence or navigation target |
| rough-fixture-ui | state set, rough layout, or core interaction shape |
| final-fixture-ui | confirmed copy, visual spec, or final state matrix |
| api-integrated-ui | endpoint, response shape, auth, error, pagination, or data contract |
| production-ready | release/CI/deployment policy, normally outside ambiguity triage |

## Packet Output

Work Packets should record only the minimal `Safe To Proceed?` table and any D-cand/U-cand notes needed for review. Detailed candidates stay advisory until a person writes them into ScreenSpec/Open Decisions or asks an agent to reconcile them.

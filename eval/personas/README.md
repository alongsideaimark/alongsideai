# Alongside AI — Canonical Test Personas (v1)

25 persona files for the plan-generator quality validation pipeline.

## Workflow

1. Hand a persona file to Claude Chrome.
2. Chrome navigates to alongsideai.ai/questionnaire.
3. Chrome fills out the questionnaire **typing answers verbatim** (instructions inside each file).
4. The submission becomes a canonical input for the eval harness.

## Each file contains

- **YAML frontmatter** — metadata for the eval harness (id, segment, tech_comfort, ai_exposure, variation_tags).
- **Chrome instructions block** — explicit "type verbatim, don't smooth, pick exact-match options" guardrails. Without these, Chrome's default behavior smooths voice variation into chatbot-bland.
- **Voice card** — tight bullets covering register, sentence shape, detail level, and what NOT to do.
- **Questionnaire responses** — 7 sections matching the live questionnaire.

## Roster

### Business Owners (8)
| # | Name | Segment summary |
|---|------|-----------------|
| 01 | Diane C. | PT practice owner, Atlanta, mid-tech, 3 locations |
| 02 | Marcus R. | HVAC company owner, Phoenix, 25 employees, tech-comfortable |
| 03 | Janet P. | Bookkeeping firm, Iowa City, retiring in 3 years |
| 04 | Reggie T. | 2 dry cleaners, Detroit metro, low-tech, weary |
| 05 | Lila K. | DTC skincare, Portland, tech-savvy, tool sprawl |
| 06 | Hank D. | Commercial landscaping, Greensboro, son taking over |
| 07 | Pam W. | Family law practice, Charleston, office mgr retired |
| 08 | Vincent A. | 2-location jewelry, Tampa, no e-commerce |

### Semi-Retired Professionals (8)
| # | Name | Segment summary |
|---|------|-----------------|
| 09 | Robert M. | Retired commercial banker, consults |
| 10 | Carol B. | Retired pediatrician, family foundation, family logistics |
| 11 | David W. | Ex-CRO, board work + angel investing, AI-skeptic |
| 12 | Susan H. | Retired educator, writing memoir |
| 13 | Joaquin N. | Semi-retired architect, Santa Fe |
| 14 | Margaret S. | Retired federal judge, AI-resistant-curious |
| 15 | Bill K. | Sold mfg co, 2yr non-compete, exploring real estate |
| 16 | Eleanor F. | Retired marketing exec, classical music Substack |

### Busy Professionals (6)
| # | Name | Segment summary |
|---|------|-----------------|
| 17 | Rachel T. | Law firm partner, Chicago, 2 kids |
| 18 | Aaron L. | Anesthesiologist, Boston, dual-physician household, 3 kids |
| 19 | Chris O. | Marketing director, regional bank, single, burnout-adjacent |
| 20 | Priya M. | VP Ops, SaaS Austin, AI power user |
| 21 | Tom B. | School superintendent, wife is nurse |
| 22 | Stephanie A. | Freelance designer, single mom |

### Edge Cases (3)
| # | Name | Tests |
|---|------|-------|
| 23 | Mike J. | Very technical (FAANG PM, ex-engineer, high AI literacy) — tests self-promotion drift |
| 24 | Ed S. | Very non-technical (rural auto shop, flip phone) — tests complexity-mismatch |
| 25 | Sarah J. | Unusual industry (Bristol Bay commercial fishing) — tests template generalization |

## Variation matrix

- **Age:** 35–73
- **Geography:** Northeast, Mid-Atlantic, Southeast, Midwest, Southwest, Pacific Northwest, Alaska
- **Tech comfort:** very low (1) / low (2) / medium (12) / high (8) / very high (2)
- **AI exposure:** none (3) / very light (1) / light (12) / moderate (5) / heavy (3) / very heavy (1)
- **Gender:** roughly balanced
- **Family structure:** single, dual-career, family-coordinator, empty-nest, single parent, retiree

## Notes

- Voices are intentionally varied. Resist the urge to homogenize during evaluation — that's the calibration value.
- Edge cases (23–25) are designed to probe specific failure modes; expect plans to reveal model behavior under stress.
- Questionnaire structure was sourced from earlier planning conversations. If the live `/questionnaire/` route has drifted from this 7-section structure, alignment will be needed before Chrome can fill these in cleanly.

— Generated for AAI Phase 1 Quality Validation pipeline

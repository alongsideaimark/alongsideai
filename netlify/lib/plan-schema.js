// JSONSchema for the submit_plan tool — the contract between the prompt
// and the pipeline. Derived from the JSON example in prompt.md.

const toolSchema = {
  type: "object",
  properties: {
    first_name: { type: "string" },
    prepared_for_name: { type: "string" },
    prepared_for_tagline: { type: "string" },
    note_to_start: {
      type: "object",
      description: "Section 01 opening — headline and lede personalized to this respondent. The two paragraphs after the lede are fixed boilerplate (do not include them here).",
      properties: {
        headline: {
          type: "string",
          description: "The H2 headline for Section 01. Acknowledges something specific from their answers. Must include one *italic* fragment for the editorial line break. 6–12 words. Examples: 'Thank you for being so honest about *the messy file system.*' or 'You named the right friction — *and that's the whole game.*' Never reuse 'Thank you for trusting us with the honest version.'",
        },
        lede: {
          type: "string",
          description: "The first paragraph (rendered as p.lede). Acknowledges 1–2 concrete details from their briefing (their work, their named friction, their wish) in 2–3 sentences. Sets up the plan. Quiet, warm, editorial — no hype. Must NOT repeat the trust-copy that follows (we don't sell software / suggestion not commitment).",
        },
      },
      required: ["headline", "lede"],
    },
    observations: {
      type: "array",
      items: { type: "string" },
    },
    picking: {
      type: "object",
      properties: {
        title: { type: "string" },
        lede: { type: "string" },
        extra_paragraph: { type: "string" },
      },
      required: ["title", "lede", "extra_paragraph"],
    },
    tools_lede: { type: "string" },
    foundation_tally: { type: "string" },
    foundation_tools: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          cost: { type: "string" },
          conditional: { type: "boolean" },
          build_it_yourself: { type: "boolean" },
          what_it_is: { type: "string" },
          why_it_helps_you: { type: "string" },
          what_it_wont_fix: { type: "string" },
          setup_steps: { type: "array", items: { type: "string" } },
          setup_tip: { type: "string" },
          prompts: { type: "array", items: { type: "object" } },
        },
        required: [
          "name", "cost", "conditional", "build_it_yourself",
          "what_it_is", "why_it_helps_you", "what_it_wont_fix",
          "setup_steps", "setup_tip", "prompts",
        ],
      },
    },
    ai_tally: { type: "string" },
    ai_tools: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          cost: { type: "string" },
          conditional: { type: "boolean" },
          build_it_yourself: { type: "boolean" },
          what_it_is: { type: "string" },
          why_it_helps_you: { type: "string" },
          what_it_wont_fix: { type: "string" },
          setup_steps: { type: "array", items: { type: "string" } },
          setup_tip: { type: "string" },
          prompts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                text: { type: "string" },
                note: { type: "string" },
              },
              required: ["label", "text", "note"],
            },
          },
        },
        required: [
          "name", "cost", "conditional", "build_it_yourself",
          "what_it_is", "why_it_helps_you", "what_it_wont_fix",
          "setup_steps", "setup_tip", "prompts",
        ],
      },
    },
    custom_build: {
      type: "object",
      properties: {
        title: { type: "string" },
        lede: { type: "string" },
        project_name: { type: "string" },
        project_pitch: { type: "string" },
        platform: { type: "string" },
        platform_cost: { type: "string" },
        setup_steps: { type: "array", items: { type: "string" } },
        setup_tip: { type: "string" },
        system_prompt_label: { type: "string" },
        system_prompt: { type: "string" },
        system_prompt_note: { type: "string" },
        test_queries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              input: { type: "string" },
              expected: { type: "string" },
              red_flag: { type: "string" },
            },
            required: ["label", "input", "expected", "red_flag"],
          },
        },
        iteration_tip: { type: "string" },
      },
      required: [
        "title", "lede", "project_name", "project_pitch",
        "platform", "platform_cost", "setup_steps", "setup_tip",
        "system_prompt_label", "system_prompt", "system_prompt_note",
        "test_queries", "iteration_tip",
      ],
    },
    ruled_out: {
      type: "object",
      properties: {
        lede: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              reason: { type: "string" },
            },
            required: ["name", "reason"],
          },
        },
      },
      required: ["lede", "items"],
    },
    practice: {
      type: "object",
      properties: {
        title: { type: "string" },
        lede: { type: "string" },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task: { type: "string" },
              today: { type: "string" },
              with_plan: { type: "string" },
              weekly_saved: { type: "string" },
            },
            required: ["task", "today", "with_plan", "weekly_saved"],
          },
        },
        weekly_total: { type: "string" },
        caveat: { type: "string" },
      },
      required: ["title", "lede", "rows", "weekly_total", "caveat"],
    },
    rollout: {
      type: "object",
      properties: {
        lede: { type: "string" },
        week1: {
          type: "object",
          properties: {
            time: { type: "string" },
            summary: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["time", "summary", "bullets"],
        },
        week2: {
          type: "object",
          properties: {
            time: { type: "string" },
            summary: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["time", "summary", "bullets"],
        },
        checkin_note: { type: "string" },
      },
      required: ["lede", "week1", "week2", "checkin_note"],
    },
    guardrails: {
      type: "object",
      properties: {
        lede: { type: "string" },
        never_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["never"] },
              text: { type: "string" },
            },
            required: ["level", "text"],
          },
        },
        caution_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["caution"] },
              text: { type: "string" },
            },
            required: ["level", "text"],
          },
        },
        safe_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["safe"] },
              text: { type: "string" },
            },
            required: ["level", "text"],
          },
        },
        wrong_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["caution"] },
              text: { type: "string" },
            },
            required: ["level", "text"],
          },
        },
        cancel_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              instructions: { type: "string" },
            },
            required: ["name", "instructions"],
          },
        },
      },
      required: [
        "lede", "never_items", "caution_items",
        "safe_items", "wrong_items", "cancel_items",
      ],
    },
    numbers: {
      type: "object",
      properties: {
        title: { type: "string" },
        lede: { type: "string" },
        software_lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              cost: { type: "string" },
            },
            required: ["label", "cost"],
          },
        },
        software_total: { type: "string" },
        implementation_lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              cost: { type: "string" },
            },
            required: ["label", "cost"],
          },
        },
        implementation_total: { type: "string" },
        net_note_heading: { type: "string" },
        net_note_body: { type: "string" },
      },
      required: [
        "title", "lede", "software_lines", "software_total",
        "implementation_lines", "implementation_total",
        "net_note_heading", "net_note_body",
      ],
    },
    team_handoffs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          audience: { type: "string" },
          intro: { type: "string" },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tool: { type: "string" },
                what_they_do: { type: "string" },
                steps: { type: "array", items: { type: "string" } },
                when_to_escalate: { type: "string" },
              },
              required: ["tool", "what_they_do", "steps", "when_to_escalate"],
            },
          },
        },
        required: ["audience", "intro", "tasks"],
      },
    },
    day30_worksheet: {
      type: "object",
      properties: {
        intro: { type: "string" },
        metrics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              unit: { type: "string" },
              target: { type: "string" },
            },
            required: ["label", "unit", "target"],
          },
        },
      },
      required: ["intro", "metrics"],
    },
    milestones: {
      type: "object",
      properties: {
        month3: { type: "string" },
        month6: { type: "string" },
        month12: { type: "string" },
      },
      required: ["month3", "month6", "month12"],
    },
    // Internal audit fields — not rendered to the customer. These force the writer
    // to expose work in the artifact so the final self-check can actually bind.
    // See: external reviewer feedback on artifact-visible vs invisible-process audits.
    coverage_map: {
      type: "array",
      description: "One entry per named friction/manual_task/wish/inbox-overwhelm in the briefing. Required parallelism across items — each row must be filled to the same depth. Empty or thin rows are failures.",
      items: {
        type: "object",
        required: ["named_friction", "source", "tool_or_section", "specific_feature", "where_addressed"],
        properties: {
          named_friction: { type: "string", description: "The friction in the respondent's exact words from the briefing." },
          source: { type: "string", description: "Where in the briefing this came from (e.g., 'manual_tasks[2]', 'friction', 'wish', 'inbox')." },
          tool_or_section: { type: "string", description: "The specific tool or plan section that retires this friction." },
          specific_feature: { type: "string", description: "The specific feature/workflow inside that tool. Not 'Claude handles it' — 'Claude Projects feature lets her drop PDFs in and ask X.'" },
          where_addressed: { type: "string", description: "Section reference (e.g., 'ai_tools[1]', 'custom_build', 'foundation_tools[0]')." },
        },
      },
    },
    verification_log: {
      type: "array",
      description: "Every price, tier-feature claim, vendor policy statement, or integration claim that's load-bearing for a recommendation. Forces verification work into the artifact so the audit can check it.",
      items: {
        type: "object",
        required: ["claim", "source", "verified_on"],
        properties: {
          claim: { type: "string", description: "The exact claim being made (e.g., 'Homebase Essentials is $30/mo, AI Scheduling is on Plus at $70/mo per location')." },
          source: { type: "string", description: "Where you verified it (e.g., 'homebase.com/pricing', 'anthropic.com/claude-pro', 'JAMA Open 2026-03 study')." },
          verified_on: { type: "string", description: "ISO date you ran the search (e.g., '2026-05-14')." },
        },
      },
    },
    existing_subscriptions_reviewed: {
      type: "array",
      description: "One row per paid subscription the respondent already names in their briefing. Forces an explicit audit of whether that subscription's 2024-25 AI features could retire a named friction before recommending a new tool. Empty array is valid ONLY if the respondent named zero existing paid subscriptions.",
      items: {
        type: "object",
        required: ["subscription", "ai_features_2024_25", "retires_named_friction", "decision"],
        properties: {
          subscription: { type: "string", description: "The subscription name from the briefing (e.g., 'QuickBooks Online', 'Canva', 'Later')." },
          ai_features_2024_25: { type: "array", items: { type: "string" }, description: "AI features this product added in 2024-25 you verified via search. Empty array if you verified there are no relevant AI features." },
          retires_named_friction: { type: "string", description: "If the AI features retire a named friction, name the friction. Empty string if not applicable." },
          decision: { type: "string", description: "Your decision — e.g., 'Recommend turning on Intuit Assist for supply-order capture instead of a new Dext subscription', or 'No relevant AI features — proceed with new tool recommendation', or 'Recommend the existing Later AI Caption Writer instead of ChatGPT for captions.'" },
        },
      },
    },
  },
  required: [
    "first_name", "prepared_for_name", "prepared_for_tagline",
    "note_to_start",
    "observations", "picking", "tools_lede",
    "foundation_tally", "foundation_tools",
    "ai_tally", "ai_tools",
    "custom_build", "ruled_out", "practice",
    "rollout", "guardrails", "numbers",
    "team_handoffs", "day30_worksheet", "milestones",
    "coverage_map", "verification_log", "existing_subscriptions_reviewed",
  ],
};

const SUBMIT_PLAN_SCHEMA = toolSchema;

const SUBMIT_INSUFFICIENT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    missing: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: ["missing", "note"],
};

const SUBMIT_REVISION_SCHEMA = {
  type: "object",
  properties: {
    note: { type: "string" },
    plan: toolSchema,
  },
  required: ["note", "plan"],
};

module.exports = { SUBMIT_PLAN_SCHEMA, SUBMIT_INSUFFICIENT_INPUT_SCHEMA, SUBMIT_REVISION_SCHEMA };

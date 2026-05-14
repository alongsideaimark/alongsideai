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

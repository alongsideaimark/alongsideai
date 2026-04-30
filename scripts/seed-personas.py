#!/usr/bin/env python3
"""
seed-personas.py — submit eval personas to the live Alongside AI pipeline

Usage:
  python scripts/seed-personas.py --dry-run           # print all payloads, submit nothing
  python scripts/seed-personas.py --dry-run --only=01  # print one payload
  python scripts/seed-personas.py --only=01            # submit persona 01 only
  python scripts/seed-personas.py                      # submit all 25 personas
"""

import argparse
import os
import re
import sys
import time
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PERSONAS_DIR = os.path.join(SCRIPT_DIR, "..", "eval", "personas")
SUBMIT_URL = "https://alongsideai.ai/"
DELAY_S = 3

# ---------------------------------------------------------------------------
# Persona markdown parser
# ---------------------------------------------------------------------------

def parse_frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).split("\n"):
        colon = line.find(":")
        if colon < 0:
            continue
        key = line[:colon].strip()
        val = line[colon + 1:].strip()
        if val.startswith("[") and val.endswith("]"):
            val = [s.strip() for s in val[1:-1].split(",")]
        fm[key] = val
    return fm


def parse_qa(text):
    qa = {}
    body = re.sub(r"^---.*?---", "", text, flags=re.DOTALL).strip()
    section_parts = re.split(r"### Section \d+ —[^\n]*", body)

    for section in section_parts:
        question_blocks = re.split(r"\n\*\*", section)
        for block in question_blocks:
            block = block.strip()
            if not block:
                continue
            m = re.match(r"^([^*]+)\*\*\s*\n?([\s\S]*)", block)
            if not m:
                continue
            question = m.group(1).strip().rstrip(":?.").strip()
            answer = m.group(2).strip()
            skip_prefixes = ("#", "Register", "Sentence", "Detail", "Don't")
            if answer and not any(question.startswith(p) for p in skip_prefixes):
                qa[question] = answer
    return qa


# ---------------------------------------------------------------------------
# Map persona Q&A → form field values
# ---------------------------------------------------------------------------

def map_comfort(text):
    t = text.lower()
    if "avoid" in t:
        return "avoid"
    if "basics" in t or "handle the basics" in t:
        return "basics"
    if "okay" in t or "want to do more" in t:
        return "okay"
    if "comfortable" in t or "just busy" in t:
        return "comfortable"
    return ""


def map_situation(segment):
    m = {
        "business_owner": "business",
        "semi_retired": "semi_retired",
        "retired": "retired",
        "professional": "professional",
        "helping": "helping",
        "busy_professional": "professional",
    }
    return m.get(segment, "other")


WORD_NUMS = {
    "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "twenty-five": 25, "thirty": 30, "forty": 40, "fifty": 50,
}

def map_team(work_text, biz_text, biz_size=""):
    combined = ((work_text or "") + " " + (biz_text or "") + " " + (biz_size or "")).lower()
    # Check for employee counts (digits)
    m = re.search(r"(\d+)\s*(employee|staff|people|team member)", combined)
    if m:
        n = int(m.group(1))
        return "small" if n <= 10 else "larger"
    # Check for spelled-out numbers
    for word, num in WORD_NUMS.items():
        if re.search(rf"\b{word}\s*(employee|staff|people|team member)", combined):
            return "small" if num <= 10 else "larger"
    if re.search(r"spouse|partner|husband|wife|dan and i|my wife|my husband", combined) and not re.search(r"employee|staff|team of", combined):
        return "partner"
    if re.search(r"just me|solo|one-person|one person|by myself|on my own", combined) and not re.search(r"team|employee|staff|hire", combined):
        return "solo"
    if re.search(r"small team|few people", combined):
        return "small"
    if re.search(r"larger|big|large team|department", combined):
        return "larger"
    return "solo"


def map_devices(device_text, phone_text, computer_text):
    values = []
    combined = ((device_text or "") + " " + (phone_text or "") + " " + (computer_text or "")).lower()
    if "iphone" in combined:
        values.append("iphone")
    if "android" in combined:
        values.append("android")
    if "ipad" in combined or "tablet" in combined:
        values.append("ipad")
    if re.search(r"mac|macbook|imac", combined):
        values.append("mac")
    if re.search(r"\bpc\b|windows|dell|lenovo|surface|thinkpad", combined):
        values.append("pc")
    if not values:
        values = ["iphone", "mac"]
    return ", ".join(values)


def map_subscriptions(apps_text):
    values = []
    t = (apps_text or "").lower()
    if re.search(r"microsoft 365|office 365|outlook|word|excel|microsoft office", t):
        values.append("m365")
    if re.search(r"google workspace|gmail|google drive|google calendar|google docs", t):
        values.append("google")
    if re.search(r"quickbooks|xero|freshbooks|wave accounting", t):
        values.append("accounting")
    if re.search(r"dropbox|icloud|google drive.*paid", t):
        values.append("storage")
    if re.search(r"chatgpt|claude|gemini|copilot|ai subscription|perplexity", t):
        values.append("ai")
    if re.search(r"docusign|adobe sign|hellosign", t):
        values.append("sign")
    if re.search(r"\bcrm\b|salesforce|hubspot|zoho", t):
        values.append("crm")
    if re.search(r"calendly|acuity|scheduling", t):
        values.append("scheduling")
    if re.search(r"invoic|stripe|square.*invoic", t):
        values.append("invoicing")
    if re.search(r"password manager|1password|lastpass|bitwarden|dashlane", t):
        values.append("passwords")
    if re.search(r"mailchimp|constant contact|email marketing|convertkit|substack", t):
        values.append("email_marketing")
    if re.search(r"asana|trello|notion|todoist|monday|basecamp|project manage", t):
        values.append("project")
    if re.search(r"industry|emr|ehr|servicetitan|athena|practice|clio|buildium", t):
        values.append("industry")
    return ", ".join(values)


def map_tried_ai(text):
    t = (text or "").lower()
    if re.match(r"^no[,.\s]|not really|haven't|have not|never", t):
        return "no"
    if re.search(r"regularly|daily|every day|all the time|use it for|use one", t):
        return "regular"
    return "little"


def map_priority(text):
    t = (text or "").lower()
    if re.search(r"both|all|some of each|bit of|mix", t):
        return "mix"
    has_time = bool(re.search(r"time", t))
    has_money = bool(re.search(r"money|revenue|profit|income", t))
    has_peace = bool(re.search(r"peace|stress|calm|sanity|mind", t))
    if has_time and not has_money and not has_peace:
        return "time"
    if has_money and not has_time and not has_peace:
        return "money"
    if has_peace and not has_time and not has_money:
        return "peace"
    return "mix"


def map_urgency(text):
    t = (text or "").lower()
    if re.search(r"asap|right away|immediately|as soon as|yesterday|this week", t):
        return "asap"
    if re.search(r"month|soon|next few weeks|within the next", t):
        return "month"
    return "exploring"


def map_location(typical_week):
    t = (typical_week or "").lower()
    has_home = bool(re.search(r"home office|work from home|my home|from home|dining table|kitchen|spare bedroom", t))
    has_office = bool(re.search(r"office|drive|commute|location|clinic|shop|store|studio", t))
    if has_home and has_office:
        return "mix"
    if has_home:
        return "home"
    if has_office:
        return "office"
    return "mix"


def get_qa(qa, *keys):
    for k in keys:
        if k in qa:
            return qa[k]
    # Fallback: prefix match (handles question wording variations)
    for k in keys:
        for qk in qa:
            if qk.startswith(k):
                return qa[qk]
    return ""


def build_payload(fm, qa):
    pid = str(fm.get("id", "00")).zfill(2)
    email = "mskeehan@gmail.com"

    work_answer = get_qa(qa, "What do you do for work")
    biz_answer = get_qa(qa, "Do you run your own business? Tell us about it",
                        "Do you run your own business")
    work_combined = (work_answer + "\n\n" + biz_answer) if biz_answer else work_answer

    typical_week = get_qa(qa, "What does a typical workday look like for you",
                          "What does a typical workweek look like for you",
                          "What does a typical week look like for you")

    friction = get_qa(qa, "What takes way longer than it should in your day",
                      "What takes way longer than it should")
    avoid_doing = get_qa(qa, "Is there anything you avoid doing because it's confusing or tedious",
                         "Is there anything you avoid doing because it's tedious or confusing")
    handle_for_you = get_qa(qa, "What do you wish someone would just handle for you")
    better_way = get_qa(qa,
                        'Have you ever thought "there has to be a better way to do this"? What was it about',
                        'Have you ever thought "there has to be a better way to do this"')

    devices_text = get_qa(qa, "What devices do you use")
    phone_text = get_qa(qa, "iPhone or Android")
    computer_text = get_qa(qa, "Mac or PC")
    apps_text = get_qa(qa, "What apps or software do you use for work")
    schedule_text = get_qa(qa, "How do you keep track of your schedule, to-do list, or notes")
    communicate_text = get_qa(qa, "How do you communicate with clients or customers",
                              "How do you communicate with clients, customers, or the people you work with")

    tried_ai_text = get_qa(qa, "Have you tried any AI tools before")
    ai_experience = get_qa(qa, "If yes, what was your experience")
    nervous_text = get_qa(qa, "Is there anything about AI that makes you nervous or skeptical",
                          "Is there anything about AI that makes you nervous")

    wish_text = get_qa(qa, "If you could wave a magic wand and fix one thing about how you work, what would it be")
    time_lost = get_qa(qa, "How much time per week do you think you lose to tasks that feel inefficient")
    help_with = get_qa(qa, "Are you looking for help with your business, your personal life, or both")

    urgency_text = get_qa(qa, "How soon are you looking to get started")
    anything_else = get_qa(qa, "Is there anything else you'd like us to know")
    referral = get_qa(qa, "How did you hear about Alongside AI")

    anything_else_combined = anything_else
    if referral:
        anything_else_combined += ("\n\n" if anything_else_combined else "") + "How I heard about you: " + referral

    data_lives = schedule_text
    if communicate_text:
        data_lives += ("\n\n" if data_lives else "") + "Communication: " + communicate_text

    manual_tasks = avoid_doing
    if handle_for_you:
        manual_tasks += ("\n\n" if manual_tasks else "") + "What I wish someone would just handle for me: " + handle_for_you

    nervous = nervous_text
    if ai_experience:
        nervous = "My experience with AI so far: " + ai_experience + (("\n\n" + nervous) if nervous else "")

    return {
        "form-name": "questionnaire",
        "bot-field": "",
        "name": qa.get("Name", fm.get("name", "")),
        "contact": email,
        "situation": map_situation(fm.get("segment", "")),
        "situation_other": "",
        "comfort": map_comfort(qa.get("Comfort with technology", "")),
        "work": work_combined,
        "team": map_team(work_answer, biz_answer, fm.get("business_size", "")),
        "typical_week": typical_week,
        "location_today": map_location(typical_week),
        "location_wanted": "",
        "devices": map_devices(devices_text, phone_text, computer_text),
        "subscriptions": map_subscriptions(apps_text),
        "subscriptions_other": apps_text,
        "data_lives": data_lives,
        "tool_hated": "",
        "tool_hated_why": "",
        "friction": friction,
        "manual_tasks": manual_tasks,
        "already_tried": better_way,
        "inbox": "",
        "inbox_note": "",
        "wish": wish_text,
        "success_6mo": time_lost,
        "priority": map_priority(help_with),
        "tried_ai": map_tried_ai(tried_ai_text),
        "nervous": nervous,
        "cloud_comfort": "",
        "cloud_comfort_note": "",
        "urgency": map_urgency(urgency_text),
        "budget_posture": "",
        "anything_else": anything_else_combined,
    }


# ---------------------------------------------------------------------------
# HTTP submission
# ---------------------------------------------------------------------------

def submit_payload(payload):
    body = urllib.parse.urlencode(payload).encode("utf-8")
    req = urllib.request.Request(
        SUBMIT_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    resp = urllib.request.urlopen(req)
    return resp.status


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Submit eval personas to the live pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Print payloads without submitting")
    parser.add_argument("--only", type=str, default=None, help="Submit only persona NN (e.g. --only=01)")
    args = parser.parse_args()

    only = args.only.zfill(2) if args.only else None

    files = sorted(f for f in os.listdir(PERSONAS_DIR) if re.match(r"persona-\d{2}", f))
    if not files:
        print("No persona files found in", PERSONAS_DIR, file=sys.stderr)
        sys.exit(1)

    selected = [f for f in files if f"persona-{only}" in f] if only else files
    if not selected:
        print(f"No persona matching --only={only}", file=sys.stderr)
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "LIVE SUBMIT"
    print(f"\n{mode} — {len(selected)} persona(s)\n")

    submitted = 0
    failed = 0

    for i, fname in enumerate(selected):
        raw = open(os.path.join(PERSONAS_DIR, fname), "r", encoding="utf-8").read()
        fm = parse_frontmatter(raw)
        qa = parse_qa(raw)
        payload = build_payload(fm, qa)
        pid = str(fm.get("id", "00")).zfill(2)

        print(f"--- Persona {pid}: {fm.get('name', '?')} ({fm.get('segment', '?')}) ---")

        if args.dry_run:
            print(f"  Email: {payload['contact']}")
            print(f"  Situation: {payload['situation']}")
            print(f"  Comfort: {payload['comfort']}")
            print(f"  Team: {payload['team']}")
            print(f"  Devices: {payload['devices']}")
            print(f"  Subscriptions: {payload['subscriptions']}")
            print(f"  Tried AI: {payload['tried_ai']}")
            print(f"  Priority: {payload['priority']}")
            print(f"  Urgency: {payload['urgency']}")
            print()
            for field in ("work", "friction", "wish", "anything_else"):
                val = payload[field]
                preview = val[:120] + ("..." if len(val) > 120 else "")
                print(f"  {field}: {preview}")
            print()
            submitted += 1
        else:
            try:
                status = submit_payload(payload)
                print(f"  Submitted (HTTP {status})")
                submitted += 1
            except Exception as e:
                print(f"  FAILED: {e}", file=sys.stderr)
                failed += 1

            if i < len(selected) - 1:
                print(f"  Waiting {DELAY_S}s...", end="", flush=True)
                time.sleep(DELAY_S)
                print(" ok")

    print(f"\nDone. {submitted} submitted, {failed} failed.")
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

"""
add-skill-sprints.py — one-time backfill of sprint membership into SKILL.md frontmatter.

Writes `sprint:` into each skill's metadata block, using the map that lived in the
skills site's src/data/sprints.ts (SKILL_SPRINT). After this, the repo is the source
of truth for sprint membership as well as topic, and platform/scripts/sync-skills.mjs
carries both into the catalog.

The map is reproduced here verbatim. Nothing was re-grouped, and pr-and-earned-media
is deliberately absent: it has no sprint, and a skill with no sprint renders no
sprint line.

Run from the repo root:   py scripts/add-skill-sprints.py
Idempotent: a skill that already declares a sprint is left alone.
"""
import os
import re
import sys

SKILL_SPRINT = {
    # ai-visibility
    'seo-geo-aeo-audit':            'ai-visibility',
    'geo-citation-tracker':         'ai-visibility',
    'agent-readiness-audit':        'ai-visibility',
    'geo-content-optimization':     'ai-visibility',
    'seo-content-brief':            'ai-visibility',
    'programmatic-seo':             'ai-visibility',
    'content-repurposing':          'ai-visibility',
    'content-calendar-planning':    'ai-visibility',
    # unit-economics-retention
    'unit-economics':               'unit-economics-retention',
    'lifecycle-and-retention':      'unit-economics-retention',
    'pipeline-and-forecast':        'unit-economics-retention',
    'onboarding-activation':        'unit-economics-retention',
    'signup-flow-optimizer':        'unit-economics-retention',
    'marketing-loops':              'unit-economics-retention',
    'email-lifecycle-sequence':     'unit-economics-retention',
    'paid-media-budget-allocation': 'unit-economics-retention',
    'marketing-budget-planning':    'unit-economics-retention',
    'incrementality-and-mmm':       'unit-economics-retention',
    'marketing-report':             'unit-economics-retention',
    'ab-test-significance':         'unit-economics-retention',
    'website-conversion-audit':     'unit-economics-retention',
    'pricing-and-packaging':        'unit-economics-retention',
    'marketing-psychology':         'unit-economics-retention',
    # positioning-message
    'positioning-statement':        'positioning-message',
    'copywriting':                  'positioning-message',
    'brand-voice-governance':       'positioning-message',
    'value-proposition':            'positioning-message',
    'messaging-framework':          'positioning-message',
    'persona-builder':              'positioning-message',
    'customer-survey-design':       'positioning-message',
    'landing-page-brief':           'positioning-message',
    'brand-product-context':        'positioning-message',
    # gtm-pipeline
    'campaign-orchestrator':        'gtm-pipeline',
    'target-account-list':          'gtm-pipeline',
    'win-loss-analysis':            'gtm-pipeline',
    'sales-process-design':         'gtm-pipeline',
    'discovery-call-framework':     'gtm-pipeline',
    'objection-handling':           'gtm-pipeline',
    'cold-email-sequence':          'gtm-pipeline',
}

VALID_SPRINTS = {
    'ai-visibility', 'unit-economics-retention', 'positioning-message',
    'gtm-pipeline', 'growth-audit',
}

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS_DIR = os.path.join(REPO_ROOT, 'skills')

# Insert after the topic block (topic:, plus secondary_topics: when present),
# falling back to the version: line for a skill that has no topic.
ANCHOR = re.compile(
    r'\n  topic: [^\n]*\n(?:  secondary_topics: [^\n]*\n)?|\n  version: [^\n]*\n'
)


def main():
    if not os.path.isdir(SKILLS_DIR):
        print('No skills/ directory beside this script. Run it from the repo root.')
        return 1

    written, skipped, missing = [], [], []

    for slug, sprint in sorted(SKILL_SPRINT.items()):
        assert sprint in VALID_SPRINTS, 'unknown sprint %s' % sprint

        path = os.path.join(SKILLS_DIR, slug, 'SKILL.md')
        if not os.path.exists(path):
            missing.append(slug)
            continue

        with open(path, 'rb') as f:
            raw = f.read()
        crlf = b'\r\n' in raw
        text = raw.decode('utf-8').replace('\r\n', '\n')

        if '\n  sprint:' in text:
            skipped.append(slug)
            continue

        anchor = ANCHOR.search(text)
        if not anchor:
            print('  ! %s: no topic: or version: line in metadata - skipped' % slug)
            skipped.append(slug)
            continue

        text = text[:anchor.end()] + '  sprint: %s\n' % sprint + text[anchor.end():]
        if crlf:
            text = text.replace('\n', '\r\n')
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(text)
        written.append(slug)

    print('%d skills given a sprint, %d already had one' % (len(written), len(skipped)))
    if missing:
        print('not found in this repo: %s' % ', '.join(missing))
    print('pr-and-earned-media is intentionally left with no sprint.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
